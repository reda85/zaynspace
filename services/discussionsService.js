// services/discussionsService.js
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';
import { authHeaders } from '../lib/api';

const BACKEND_URL = 'https://zaynbackend-production.up.railway.app';

// ─────────────────────────────────────────────────────────────────────────────
// GROUPS
// ─────────────────────────────────────────────────────────────────────────────

export const fetchGroups = async (projectId) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  const { data, error } = await supabase
    .from('discussions_groups')
    .select(`
      *,
      discussions_members!inner(user_id, role, last_read_at),
      discussions_messages(id, created_at, content)
    `)
    .eq('project_id', projectId)
    .eq('discussions_members.user_id', user.id)
    .eq('is_active', true)
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
};

export const createGroup = async ({ projectId, name, description }) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  // Uses a SECURITY DEFINER RPC to avoid auth.uid() JWT evaluation issues
  const { data, error } = await supabase.rpc('create_discussion_group', {
    p_project_id:  projectId,
    p_name:        name.trim(),
    p_description: description?.trim() || null,
  });

  if (error) throw error;
  return data;
};

export const updateGroup = async (groupId, updates) => {
  const { data, error } = await supabase
    .from('discussions_groups')
    .update(updates)
    .eq('id', groupId)
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ─────────────────────────────────────────────────────────────────────────────
// MEMBERS
// ─────────────────────────────────────────────────────────────────────────────

export const fetchMembers = async (groupId) => {
  const { data, error } = await supabase
    .from('discussions_members')
    .select(`*, members(auth_id, name, email, avatar_url)`)
    .eq('group_id', groupId);

  if (error) throw error;
  return data ?? [];
};

/**
 * Search project members who are not yet in the group.
 * Queries members_projects table to find users in this specific project.
 */
export const searchInvitableUsers = async (groupId, projectId, query) => {
  // Get auth_ids already in the group to exclude them
  const { data: existing } = await supabase
    .from('discussions_members')
    .select('user_id')
    .eq('group_id', groupId);

  const excludeAuthIds = (existing ?? []).map(m => m.user_id); // these are auth.users ids

  // Fetch project members via members_projects → members
  // members_projects.member_id → members.id (PK)
  // members.auth_id → auth.users.id
  const { data, error } = await supabase
    .from('members_projects')
    .select('member_id, members(id, auth_id, name, email, avatar_url)')
    .eq('project_id', projectId)
    .limit(50);


  if (error) throw error;

  // Flatten, exclude already-in-group users, filter by search query
  let results = (data ?? [])
    .map(row => ({
      member_pk: row.member_id,           // members.id (PK)
      auth_id:   row.members?.auth_id,    // auth.users.id
      name:      row.members?.name,
      email:     row.members?.email,
      avatar_url: row.members?.avatar_url,
    }))
    .filter(u => u.auth_id)                                        // valid join
    .filter(u => !excludeAuthIds.includes(u.auth_id));             // not already in group

  if (query?.trim()) {
    const q = query.toLowerCase();
    results = results.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }

  return results;
};

export const addMember = async (groupId, userId, role = 'member') => {
  const { data, error } = await supabase
    .from('discussions_members')
    .insert({ group_id: groupId, user_id: userId, role })
    .select()
    .single();

  if (error) throw error;
  return data;
};

export const removeMember = async (groupId, userId) => {
  const { error } = await supabase
    .from('discussions_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId);

  if (error) throw error;
};

export const markGroupRead = async (groupId) => {
  const { error } = await supabase.rpc('mark_discussion_read', { p_group_id: groupId });
  if (error) console.error('markGroupRead error:', error);
};

export const getUnreadCount = async (groupId) => {
  const { data, error } = await supabase.rpc('get_discussion_unread', { p_group_id: groupId });
  if (error) { console.error('getUnreadCount error:', error); return 0; }
  return data ?? 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES
// ─────────────────────────────────────────────────────────────────────────────

export const fetchMessages = async (groupId, limit = 50, before = null) => {
  let query = supabase
    .from('discussions_messages')
    .select(`
      *,
      members(auth_id, name, avatar_url),
      discussions_attachments(*),
      discussions_linked_items(*)
    `)
    .eq('group_id', groupId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) throw error;

  // Return oldest-first for chat display
  return (data ?? []).reverse();
};

/**
 * Send a message, upload attachments, and link any app items.
 * @param {string} groupId
 * @param {string} content  - text body
 * @param {Array}  files    - [{ uri, name, mimeType }]
 * @param {Array}  linked   - [{ item_type: 'pin'|'plan'|'photo', item_id, label }]
 */
export const sendMessage = async (groupId, content, files = [], linked = []) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');

  // 1. Insert message
  const { data: message, error: msgErr } = await supabase
    .from('discussions_messages')
    .insert({ group_id: groupId, user_id: user.id, content: content.trim() || null })
    .select(`*, members(auth_id, name, avatar_url)`)
    .single();

  if (msgErr) throw msgErr;

  // 2. Upload files (if any)
  if (files.length > 0) {
    const uploadedAttachments = await Promise.all(
      files.map(f => _uploadAttachment(message.id, user.id, f))
    );
    message.discussions_attachments = uploadedAttachments.filter(Boolean);
  } else {
    message.discussions_attachments = [];
  }

  // 3. Link items (if any)
  if (linked.length > 0) {
    const rows = linked.map(l => ({
      message_id: message.id,
      item_type: l.item_type,
      item_id: l.item_id,
      label: l.label ?? null,
    }));
    await supabase.from('discussions_linked_items').insert(rows);
    message.discussions_linked_items = rows;
  } else {
    message.discussions_linked_items = [];
  }

  // 4. Send FCM notification to group members (fire & forget)
  _notifyGroupMembers(groupId, user, content, message.id).catch(console.warn);

  return message;
};

const _uploadAttachment = async (messageId, userId, file) => {
  try {
    const base64 = await FileSystem.readAsStringAsync(file.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const ext = file.name.split('.').pop();
    const storagePath = `${userId}/${messageId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('discussions')
      .upload(storagePath, decode(base64), { contentType: file.mimeType });

    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from('discussions').getPublicUrl(storagePath);

    const fileType = file.mimeType?.startsWith('image/') ? 'image' : 'document';

    const { data, error } = await supabase
      .from('discussions_attachments')
      .insert({
        message_id: messageId,
        file_name: file.name,
        file_url: publicUrl,
        storage_path: storagePath,
        file_type: fileType,
        mime_type: file.mimeType,
        file_size: file.size ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (err) {
    console.error('Attachment upload failed:', err);
    return null;
  }
};

export const deleteMessage = async (messageId) => {
  const { error } = await supabase
    .from('discussions_messages')
    .update({ is_deleted: true, content: null })
    .eq('id', messageId);

  if (error) throw error;
};

// ─────────────────────────────────────────────────────────────────────────────
// REALTIME
// ─────────────────────────────────────────────────────────────────────────────

export const subscribeToMessages = (groupId, onNewMessage) => {
  const channel = supabase
    .channel(`disc_messages:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'discussions_messages', filter: `group_id=eq.${groupId}` },
      async (payload) => {
        // Show message instantly with basic data
        const basic = {
          ...payload.new,
          members: null,
          discussions_attachments: [],
          discussions_linked_items: [],
        };
        onNewMessage(basic);

        // Hydrate in background with full joins
        const { data } = await supabase
          .from('discussions_messages')
          .select(`*, members(auth_id, name, avatar_url), discussions_attachments(*), discussions_linked_items(*)`)
          .eq('id', payload.new.id)
          .single();

        if (data) onNewMessage(data);
      }
    )
    .subscribe((status, err) => {
      console.log('💬 Channel status:', status, err ?? '');
    });

  return channel;
};

export const unsubscribeFromMessages = (channel) => {
  if (channel) supabase.removeChannel(channel);
};

// ─────────────────────────────────────────────────────────────────────────────
// FCM — uses your existing backend endpoint
// ─────────────────────────────────────────────────────────────────────────────

const _notifyGroupMembers = async (groupId, sender, content, messageId) => {
  // Get group member user_ids (excluding sender)
  const { data: members } = await supabase
    .from('discussions_members')
    .select('user_id')
    .eq('group_id', groupId)
    .neq('user_id', sender.id);

  if (!members || members.length === 0) return;

  const { data: group } = await supabase
    .from('discussions_groups')
    .select('name')
    .eq('id', groupId)
    .single();

  const userIds = members.map(m => m.user_id);
  const senderName = sender.user_metadata?.name ?? sender.email ?? 'Quelqu\'un';
  const bodyText = content?.trim()
    ? content.length > 80 ? content.slice(0, 80) + '…' : content
    : 'A envoyé une pièce jointe';

  // Reuse your existing bulk notification endpoint
  await fetch(`${BACKEND_URL}/api/notifications/send-bulk`, {
    method: 'POST',
    headers: await authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      userIds,
      title: group?.name ?? 'Discussion',
      body: `${senderName} : ${bodyText}`,
      data: {
        type: 'discussion_message',
        groupId,
        messageId,
      },
    }),
  });
};