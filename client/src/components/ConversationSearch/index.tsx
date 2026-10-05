import { useState, type FormEvent } from 'react';
import { Close, KeyboardArrowDown, KeyboardArrowUp, Search } from '@mui/icons-material';
import { Box, CircularProgress, IconButton, InputAdornment, TextField, Tooltip, Typography } from '@mui/material';

import type { Message } from '@/types/messenger';
import styles from './index.module.scss';

type ConversationSearchProps = {
  onSearch: (query: string) => Promise<Message[]>;
  onSelect: (message: Message) => void;
  compact?: boolean;
};

export function ConversationSearch({ onSearch, onSelect, compact = false }: ConversationSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Message[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const selectIndex = (index: number, messages = results) => {
    if (messages.length === 0) return;
    const normalized = (index + messages.length) % messages.length;
    setCurrentIndex(normalized);
    const message = messages[normalized];
    if (message) onSelect(message);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const cleanQuery = query.trim();
    if (!cleanQuery) return;
    setLoading(true);
    const found = await onSearch(cleanQuery);
    setResults(found);
    setSearched(true);
    setCurrentIndex(found.length > 0 ? 0 : -1);
    if (found[0]) onSelect(found[0]);
    setLoading(false);
  };

  const clear = () => {
    setQuery('');
    setResults([]);
    setCurrentIndex(-1);
    setSearched(false);
  };

  return (
    <Box
      component="form"
      className={`${styles.search!} ${compact ? styles.compact! : ''}`}
      onSubmit={(event) => void submit(event)}
    >
      <TextField
        size="small"
        value={query}
        placeholder="Поиск в беседе"
        onChange={(event) => setQuery(event.target.value)}
        className={styles.field!}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <IconButton type="submit" size="small" aria-label="Найти в беседе"><Search fontSize="small" /></IconButton>
            </InputAdornment>
          ),
          endAdornment: query && (
            <InputAdornment position="end">
              <IconButton size="small" onClick={clear} aria-label="Очистить поиск"><Close fontSize="small" /></IconButton>
            </InputAdornment>
          ),
        }}
      />
      {loading ? (
        <CircularProgress size={20} />
      ) : results.length > 0 ? (
        <>
          <Typography variant="caption" className={styles.counter!}>{currentIndex + 1}/{results.length}</Typography>
          <Tooltip title="Предыдущее совпадение">
            <IconButton size="small" onClick={() => selectIndex(currentIndex + 1)} aria-label="Предыдущее совпадение">
              <KeyboardArrowUp />
            </IconButton>
          </Tooltip>
          <Tooltip title="Следующее совпадение">
            <IconButton size="small" onClick={() => selectIndex(currentIndex - 1)} aria-label="Следующее совпадение">
              <KeyboardArrowDown />
            </IconButton>
          </Tooltip>
        </>
      ) : searched ? (
        <Typography variant="caption" className={styles.counter!}>0</Typography>
      ) : null}
    </Box>
  );
}
