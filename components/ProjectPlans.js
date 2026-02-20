// app/ProjectPlans.tsx
import * as DocumentPicker from 'expo-document-picker'
import { router } from 'expo-router'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { Button, FlatList, Text, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { supabase } from '../lib/supabase'
import { selectedProjectAtom } from '../store/atoms'

export default function ProjectPlans() {
  const selectedProject = useAtomValue(selectedProjectAtom)
  const [plans, setPlans] = useState([])
  const [viewUrl, setViewUrl] = useState(null)

  // Guard — if no project selected (e.g. during logout), go back
  useEffect(() => {
    if (!selectedProject) {
      router.back()
    }
  }, [selectedProject])

  const fetchPlans = async () => {
    if (!selectedProject) return
    const { data } = await supabase
      .from('plans')
      .select('*')
      .eq('project_id', selectedProject.id)
    if (data) setPlans(data)
  }

  useEffect(() => {
    fetchPlans()
  }, [selectedProject])

  const uploadPDF = async () => {
    if (!selectedProject) return
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' })
    if (result.type === 'success') {
      const file = await fetch(result.uri)
      const blob = await file.blob()
      const filePath = `${selectedProject.id}/${Date.now()}-${result.name}`

      const { error } = await supabase.storage
        .from('project-plans')
        .upload(filePath, blob)

      if (!error) {
        await supabase.from('plans').insert({
          name: result.name.replace('.pdf', ''),
          project_id: selectedProject.id,
          file_url: filePath,
        })
        fetchPlans()
      }
    }
  }

  const deletePlan = async (plan) => {
    await supabase.from('plans').delete().eq('id', plan.id)
    await supabase.storage.from('project-plans').remove([plan.file_url])
    fetchPlans()
  }

  if (!selectedProject) return null

  if (viewUrl) {
    return (
      <WebView
        source={{ uri: viewUrl }}
        style={{ flex: 1 }}
        onError={() => setViewUrl(null)}
      />
    )
  }

  return (
    <View style={{ padding: 20, flex: 1 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold' }}>{selectedProject.name}</Text>
      <Button title="Upload PDF" onPress={uploadPDF} />

      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const publicUrl = supabase.storage
            .from('project-plans')
            .getPublicUrl(item.file_url).data.publicUrl
          return (
            <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f0f0f0' }}>
              <Text>{item.name}</Text>
              <Button title="View" onPress={() => setViewUrl(publicUrl)} />
              <Button title="Delete" color="red" onPress={() => deletePlan(item)} />
            </View>
          )
        }}
      />
    </View>
  )
}