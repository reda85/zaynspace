import { useAtom } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { categoriesAtom, statusesAtom } from '../store/atoms';

export function usePinFilters(pins) {
  const [searchTerm, setSearchTerm] = useState('');
  const [createdByMe, setCreatedByMe] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [dateActive, setDateActive] = useState(false);
  const [dateTags, setDateTags] = useState([]);
  const [activeStatuses, setActiveStatuses] = useState([]);
  const [categoryActive, setCategoryActive] = useState(false);
  const [categoryTags, setCategoryTags] = useState([]);
  const [tagActive, setTagActive] = useState(false);
  const [tagIds, setTagIds] = useState([]);
  const [assignedToActive, setAssignedToActive] = useState(false);
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [filteredPins, setFilteredPins] = useState(pins ?? []);
  const [statuses] = useAtom(statusesAtom);
  const [categories] = useAtom(categoriesAtom);

  useEffect(() => {
    let result = [...pins];

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter((p) => p.name?.toLowerCase().includes(lower));
    }

    if (createdByMe) {
      result = result.filter((p) => p.created_by === 'me');
    }

    if (activeStatuses.length > 0) {
      result = result.filter((p) =>
        activeStatuses.includes(statuses.find((s) => s.id === p.status_id)?.id)
      );
    }

    if (categoryActive) {
      if (categoryTags.length === 0) {
        result = [];
      } else {
        result = result.filter((p) =>
          categoryTags.includes(
            categories.find((c) => c.id === p.category_id)?.name
          )
        );
      }
    }

    if (overdue) {
      result = result.filter(
        (p) => p.due_date && new Date(p.due_date) < new Date()
      );
    }

    if (dateActive) {
      if (dateTags.length === 0) {
        result = [];
      } else {
        result = result.filter((p) => {
          if (!p.created_at) return false;
          const created = new Date(p.created_at);
          const now = new Date();
          return dateTags.some((tag) => {
            if (tag === "Aujourd'hui") return created.toDateString() === now.toDateString();
            if (tag === 'Cette semaine') {
              const weekStart = new Date(now);
              weekStart.setDate(now.getDate() - now.getDay());
              return created >= weekStart;
            }
            if (tag === 'Ce mois-ci')
              return (
                created.getMonth() === now.getMonth() &&
                created.getFullYear() === now.getFullYear()
              );
            return false;
          });
        });
      }
    }

    if (tagActive) {
    if (tagIds.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            const pinTagIds = (p.pin_tags ?? []).map((pt) =>
                typeof pt.tags === 'object' ? pt.tags?.id : pt.tag_id
            );
            return tagIds.some((id) => pinTagIds.includes(id));
        });
    }
}

    if (assignedToActive) {
    if (selectedAssignees.length === 0) {
        result = [];
    } else {
        result = result.filter((p) => {
            const assignedId = typeof p.assigned_to === 'object'
                ? p.assigned_to?.id        // populated object: { id, name }
                : p.assigned_to;           // raw UUID string

            if (selectedAssignees.includes('__no_assignee__') && !assignedId) return true;
            if (selectedAssignees.includes(assignedId)) return true;
            return false;
        });
    }
}

    setFilteredPins(result);
  }, [
    pins,
    searchTerm,
    createdByMe,
    overdue,
    dateActive,
    dateTags,
    activeStatuses,
    categoryActive,
    categoryTags,
    tagActive,
    tagIds,
    assignedToActive,
    selectedAssignees,
  ]);

  const clearFilters = () => {
    setSearchTerm('');
    setCreatedByMe(false);
    setOverdue(false);
    setDateActive(false);
    setDateTags([]);
    setActiveStatuses([]);
    setCategoryActive(false);
    setCategoryTags([]);
    setTagActive(false);
    setTagIds([]);
    setAssignedToActive(false);
    setSelectedAssignees([]);
  };

  const hasActiveFilter = useMemo(() => {
    return (
      !!searchTerm ||
      createdByMe ||
      overdue ||
      dateActive ||
      activeStatuses.length > 0 ||
      categoryActive ||
      tagActive ||
      assignedToActive
    );
  }, [searchTerm, createdByMe, overdue, dateActive, activeStatuses, categoryActive, tagActive, assignedToActive]);

  return {
    filteredPins,
    searchTerm,
    setSearchTerm,
    createdByMe,
    setCreatedByMe,
    overdue,
    setOverdue,
    dateActive,
    setDateActive,
    dateTags,
    setDateTags,
    activeStatuses,
    setActiveStatuses,
    categoryActive,
    setCategoryActive,
    categoryTags,
    setCategoryTags,
    tagActive,
    setTagActive,
    tagIds,
    setTagIds,
    assignedToActive,
    setAssignedToActive,
    selectedAssignees,
    setSelectedAssignees,
    hasActiveFilter,
    clearFilters,
  };
}