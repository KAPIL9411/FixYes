import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCategories, useItems } from '../hooks/data';
import { AppText, ChoiceChip, EmptyState, ErrorState, IconButton, Skeleton, TAB_BAR_SPACE } from '../ui/core';
import { ServiceTile } from '../ui/ServiceTile';
import { Sheet } from '../ui/Sheet';
import { AppHeader } from '../components/AppHeader';
import { colors, fonts, radius } from '../theme';
import { CATEGORY_BLURB } from '../data/catalogue';
import { errorMessage } from '../lib/errors';

const RECENT_KEY = 'fixyes.recent-searches';

export default function SearchScreen() {
  const router = useRouter();
  const categories = useCategories();
  const items = useItems();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(RECENT_KEY)
      .then((value) => {
        if (value) setRecent(JSON.parse(value) as string[]);
      })
      .catch(() => undefined);
  }, []);

  const remember = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    const next = [clean, ...recent.filter((entry) => entry.toLowerCase() !== clean.toLowerCase())].slice(0, 5);
    setRecent(next);
    void AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  };

  const categoryFor = (categoryId: string) => categories.data?.find((category) => category.id === categoryId);

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (items.data ?? []).filter((item) => {
      const category = categoryFor(item.categoryId);
      const matchesCategory = !selected || item.categoryId === selected;
      const matchesTerm =
        !term ||
        item.name.toLowerCase().includes(term) ||
        (item.description ?? '').toLowerCase().includes(term) ||
        (category?.name ?? '').toLowerCase().includes(term) ||
        (CATEGORY_BLURB[category?.code ?? ''] ?? '').toLowerCase().includes(term);
      return matchesCategory && matchesTerm;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.data, query, selected, categories.data]);

  const selectedName = selected ? categoryFor(selected)?.name : null;
  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term.length < 2) return [];
    return (items.data ?? [])
      .filter((item) => item.name.toLowerCase().includes(term))
      .slice(0, 4);
  }, [items.data, query]);

  const popular = useMemo(() => (items.data ?? []).slice(0, 4), [items.data]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppHeader title="Search services" />
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search AC repair, cleaning…"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus
            returnKeyType="search"
            onSubmitEditing={() => remember(query)}
          />
          {query ? (
            <Pressable accessibilityRole="button" onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.faint} />
            </Pressable>
          ) : null}
        </View>
        <IconButton
          icon="options-outline"
          variant="violet"
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel="Filter services"
        />
      </View>

      <View style={styles.chipsRail}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <ChoiceChip label="All" selected={!selected} onPress={() => setSelected(null)} />
          {(categories.data ?? []).map((category) => (
            <ChoiceChip
              key={category.id}
              label={category.name}
              selected={selected === category.id}
              onPress={() => setSelected(selected === category.id ? null : category.id)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.results}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {!query.trim() && !selected ? (
          <>
            {recent.length > 0 ? (
              <View style={styles.suggestions}>
                <View style={styles.suggestionsHead}>
                  <AppText variant="h3">Recent searches</AppText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setRecent([]);
                      void AsyncStorage.removeItem(RECENT_KEY);
                    }}
                  >
                    <AppText variant="small" style={styles.clearRecent}>
                      Clear
                    </AppText>
                  </Pressable>
                </View>
                <View style={styles.suggestionChips}>
                  {recent.map((term) => (
                    <Pressable
                      key={term}
                      accessibilityRole="button"
                      onPress={() => setQuery(term)}
                      style={styles.suggestionChip}
                    >
                      <Ionicons name="time-outline" size={13} color={colors.muted} />
                      <AppText variant="small" style={styles.suggestionText}>
                        {term}
                      </AppText>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            <View style={styles.suggestions}>
              <AppText variant="h3" style={styles.suggestionTitle}>
                Popular searches
              </AppText>
              <View style={styles.suggestionChips}>
                {popular.map((item) => (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    onPress={() => {
                      setQuery(item.name);
                      remember(item.name);
                    }}
                    style={styles.suggestionChip}
                  >
                    <Ionicons name="search-outline" size={13} color={colors.primary} />
                    <AppText variant="small" style={styles.suggestionText}>
                      {item.name}
                    </AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {suggestions.length > 0 && query.trim() !== suggestions[0]?.name ? (
          <View style={styles.suggestions}>
            <AppText variant="h3" style={styles.suggestionTitle}>
              Suggestions
            </AppText>
            <View style={styles.suggestionChips}>
              {suggestions.map((item) => (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  onPress={() => {
                    setQuery(item.name);
                    remember(item.name);
                  }}
                  style={styles.suggestionChip}
                >
                  <Ionicons name="search-outline" size={13} color={colors.primary} />
                  <AppText variant="small" style={styles.suggestionText}>
                    {item.name}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.resultsHead}>
          <AppText variant="h2">{selectedName ?? (query.trim() ? `Results for “${query.trim()}”` : 'All services')}</AppText>
          <AppText variant="small">{results.length} available</AppText>
        </View>
        {items.isError ? (
          <ErrorState message={errorMessage(items.error)} onRetry={() => void items.refetch()} />
        ) : items.isLoading ? (
          <View style={{ gap: 10 }}>
            {[1, 2, 3].map((key) => (
              <Skeleton key={key} height={122} radius={14} />
            ))}
          </View>
        ) : results.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="Nothing matched"
            body="Try a different service or clear the filters to see everything available."
            action="Clear filters"
            onAction={() => {
              setQuery('');
              setSelected(null);
            }}
          />
        ) : (
          results.map((item) => (
            <ServiceTile
              key={item.id}
              variant="row"
              name={item.name}
              price={item.basePrice}
              categoryCode={categoryFor(item.categoryId)?.code}
              categoryName={categoryFor(item.categoryId)?.name}
              onPress={() => {
                remember(query);
                router.push({ pathname: '/service/[itemId]', params: { itemId: item.id } });
              }}
            />
          ))
        )}
        <View style={{ height: TAB_BAR_SPACE }} />
      </ScrollView>

      <Sheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filter services"
        subtitle="Choose the kind of help you need."
      >
        <View style={styles.filterList}>
          <Pressable accessibilityRole="button"
            onPress={() => {
              setSelected(null);
              setFiltersOpen(false);
            }}
            style={[styles.filterRow, !selected && styles.filterRowActive]}
          >
            <View style={styles.filterIcon}>
              <Ionicons name="apps-outline" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="h3">All services</AppText>
              <AppText variant="small">Everything available in Bareilly</AppText>
            </View>
            {!selected ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
          </Pressable>
          {(categories.data ?? []).map((category) => (
            <Pressable accessibilityRole="button"
              key={category.id}
              onPress={() => {
                setSelected(category.id);
                setFiltersOpen(false);
              }}
              style={[styles.filterRow, selected === category.id && styles.filterRowActive]}
            >
              <View style={styles.filterIcon}>
                <AppText variant="h3" style={styles.filterEmoji}>
                  {category.name.slice(0, 1)}
                </AppText>
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="h3">{category.name}</AppText>
                <AppText variant="small">Tap to show these services</AppText>
              </View>
              {selected === category.id ? (
                <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 18,
    paddingTop: 2,
    paddingBottom: 12,
  },
  search: {
    flex: 1,
    height: 50,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 9,
    borderWidth: 1,
    borderColor: colors.line,
  },
  input: {
    flex: 1,
    fontFamily: fonts.medium,
    fontSize: 13.5,
    color: colors.ink,
    paddingVertical: 10,
  },
  chipsRail: { height: 50, flexGrow: 0, flexShrink: 0 },
  chips: { gap: 8, paddingHorizontal: 18, paddingBottom: 12, alignItems: 'center' },
  results: { paddingHorizontal: 18, paddingTop: 8, gap: 12 },
  suggestions: { marginBottom: 16 },
  suggestionsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  suggestionTitle: { marginBottom: 8 },
  clearRecent: { color: colors.primary, fontFamily: fonts.semibold },
  suggestionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  suggestionText: { fontSize: 11, color: colors.inkSoft },
  resultsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  filterList: { gap: 9 },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterRowActive: { borderColor: colors.primary },
  filterIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterEmoji: { color: colors.primary },
});
