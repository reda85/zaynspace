import { pinsAtom } from '@/store/atoms';
import dayjs from 'dayjs';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isToday from 'dayjs/plugin/isToday';
import { useAtom } from 'jotai';
import { ListFilter, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { selectedProjectAtom } from '../store/atoms';
import CategoryFilter from './FilterPanel/CategoryFilter';
import CreatedByMeFilter from './FilterPanel/CreatedByMeFilter';
import DateFilter from './FilterPanel/DateFilter';
import OverdueFilter from './FilterPanel/OverdueFilter';
import StatusFilter from './FilterPanel/StatusFilter';

dayjs.extend(isToday);
dayjs.extend(isSameOrAfter);

export default function FilterPanel() {
  const [open, setOpen] = useState(false);
  const [originalPins, setPins] = useAtom(pinsAtom);
  const [allPins] = useState(originalPins);
  const [statusTags, setStatusTags] = useState([]);
  const [selectedProject] = useAtom(selectedProjectAtom);

  const [filters, setFilters] = useState({
    me: false,
    category: false,
    date: false,
    overdue: false,
  });

  const [categoryTags, setCategoryTags] = useState([]);
  const [dateTags, setDateTags] = useState([]);

  const applyFilters = () => {
    let filtered = [...allPins];

    if (filters.me) {
      filtered = filtered.filter(pin => pin.created_by === 'me'); // Replace with actual user ID
    }

    if (filters.category && categoryTags.length > 0) {
      filtered = filtered.filter(pin => categoryTags.includes(pin.category));
    }

    if (filters.date && dateTags.length > 0) {
      filtered = filtered.filter(pin => {
        const date = dayjs(pin.created_at);
        return dateTags.some(tag => {
          if (tag === 'Aujourd’hui') return date.isToday();
          if (tag === 'Cette semaine') return date.isSameOrAfter(dayjs().startOf('week'));
          if (tag === 'Ce mois-ci') return date.isSameOrAfter(dayjs().startOf('month'));
          return false;
        });
      });
    }

    if (statusTags.length > 0) {
      filtered = filtered.filter(pin => statusTags.includes(pin.status_id));
    }

    if (filters.overdue) {
      filtered = filtered.filter(pin =>
        pin.due_date && dayjs(pin.due_date).isBefore(dayjs(), 'day')
      );
    }

    setPins(filtered);
  };

  useEffect(() => {
    applyFilters();
  }, [filters, categoryTags, dateTags, statusTags]);

  return (
    <View>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={styles.iconButton}
      >
        <ListFilter size={20} color="black" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Filtres</Text>
              <TouchableOpacity onPress={() => setOpen(false)}>
                <X size={20} color="gray" />
              </TouchableOpacity>
            </View>

            <CreatedByMeFilter
              active={filters.me}
              onToggle={value => setFilters(prev => ({ ...prev, me: value }))}
            />

            <CategoryFilter
              active={filters.category}
              onToggle={value => setFilters(prev => ({ ...prev, category: value }))}
              tags={categoryTags}
              setTags={setCategoryTags}
            />

            <DateFilter
              active={filters.date}
              onToggle={value => setFilters(prev => ({ ...prev, date: value }))}
              tags={dateTags}
              setTags={setDateTags}
            />

            <StatusFilter
              activeStatuses={statusTags}
              setActiveStatuses={setStatusTags}
              selectedProject={selectedProject}
            />

            <OverdueFilter
              active={filters.overdue}
              onToggle={value => setFilters(prev => ({ ...prev, overdue: value }))}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    padding: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderColor: '#ccc',
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontWeight: 'bold',
    fontSize: 16,
  },
});
