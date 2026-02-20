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
  const [categoryTags, setCategoryTags] = useState([]); // 🔹 new
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

    if (categoryTags.length > 0) {
      result = result.filter((p) =>
        categoryTags.includes(
          categories.find((c) => c.id === p.category_id)?.name
        )
      );
    }

    if (overdue) {
      result = result.filter(
        (p) => p.due_date && new Date(p.due_date) < new Date()
      );
    }

    if (dateActive && dateTags.length > 0) {
      result = result.filter((p) => {
        if (!p.created_at) return false;
        const created = new Date(p.created_at);
        const now = new Date();
        return dateTags.some((tag) => {
          if (tag === 'Aujourd’hui') return created.toDateString() === now.toDateString();
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

    setFilteredPins(result);
  }, [
    pins,
    searchTerm,
    createdByMe,
    overdue,
    dateActive,
    dateTags,
    activeStatuses,
    categoryTags,
  ]);

  const clearFilters = () => {
    setSearchTerm('');
    setCreatedByMe(false);
    setOverdue(false);
    setDateActive(false);
    setDateTags([]);
    setActiveStatuses([]);
    setCategoryTags([]);
  };

  const hasActiveFilter = useMemo(() => {
    return (
      searchTerm ||
      createdByMe ||
      overdue ||
      dateActive ||
      activeStatuses.length > 0 ||
      categoryTags.length > 0
    );
  }, [searchTerm, createdByMe, overdue, dateActive, activeStatuses, categoryTags]);

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
    categoryTags,
    setCategoryTags, // 🔹 new
    hasActiveFilter,
    clearFilters,
  };
}
