// hooks/useResetAppState.ts
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSetAtom } from 'jotai'
import {
    categoriesAtom,
    loggedInUserAtom,
    membersAtom,
    pinsAtom,
    plansAtom,
    selectedProjectAtom,
    statusesAtom
} from '../store/atoms'

export function useResetAppState() {
  const setLoggedInUser = useSetAtom(loggedInUserAtom)
  const setPlans = useSetAtom(plansAtom)
  const setPins = useSetAtom(pinsAtom)
  const setCategories = useSetAtom(categoriesAtom)
  const setStatuses = useSetAtom(statusesAtom)
  const setMembers = useSetAtom(membersAtom)
  const setSelectedProject = useSetAtom(selectedProjectAtom)

  const resetAll = async () => {
    console.log('🧹 Resetting all app state...')
    
    setLoggedInUser(null)
    setPlans([])
    setPins([])
    setCategories([])
    setStatuses([])
    setMembers([])
    setSelectedProject(null)
    
    try {
      await AsyncStorage.removeItem('last_project_id')
    } catch (error) {
      console.error('Error clearing AsyncStorage:', error)
    }
  }

  return resetAll
}