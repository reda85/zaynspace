import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Button, FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'

export default function ProjectList({ navigation }) {
  const [projects, setProjects] = useState([])
  const [name, setName] = useState('')

  const fetchProjects = async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false })
    setProjects(data)
  }

  const createProject = async () => {
    if (!name.trim()) return
    const { data, error } = await supabase.from('projects').insert({ name }).select()
    if (!error) {
      setName('')
      fetchProjects()
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  return (
    <View style={{ padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold' }}>Projects</Text>

      <TextInput
        placeholder="New project name"
        value={name}
        onChangeText={setName}
        style={{ borderBottomWidth: 1, marginVertical: 10 }}
      />
      <Button title="Create Project" onPress={createProject} />

      <FlatList
        data={projects}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => router.push('/ProjectPlans')}
            style={{ padding: 10, backgroundColor: '#eee', marginVertical: 5 }}
          >
            <Text>{item.name}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  )
}
