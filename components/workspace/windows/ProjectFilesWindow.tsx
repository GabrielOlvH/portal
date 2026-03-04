import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronUp, FileCode2, Folder, RefreshCw, Save, Eye, Pencil } from 'lucide-react-native';

import { AppText } from '@/components/AppText';
import { fetchFileListing, readRemoteFile, statRemoteFile, writeRemoteFile } from '@/lib/api';
import { withAlpha } from '@/lib/colors';
import { useStore } from '@/lib/store';
import { theme } from '@/lib/theme';
import { FileItem, Host } from '@/lib/types';
import { useTheme, type ThemeColors } from '@/lib/useTheme';
import { useWindowActions } from '@/lib/useWindowActions';

type MarkdownBlock =
  | { type: 'h1' | 'h2' | 'h3' | 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'code'; language: string; content: string };

function parseMarkdown(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (!trimmed) {
      idx += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      idx += 1;
      const code: string[] = [];
      while (idx < lines.length && !lines[idx].trim().startsWith('```')) {
        code.push(lines[idx]);
        idx += 1;
      }
      if (idx < lines.length && lines[idx].trim().startsWith('```')) idx += 1;
      blocks.push({ type: 'code', language, content: code.join('\n') });
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push({ type: 'h1', text: trimmed.slice(2).trim() });
      idx += 1;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      blocks.push({ type: 'h2', text: trimmed.slice(3).trim() });
      idx += 1;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      blocks.push({ type: 'h3', text: trimmed.slice(4).trim() });
      idx += 1;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items: string[] = [];
      while (idx < lines.length) {
        const candidate = lines[idx].trim();
        if (!(candidate.startsWith('- ') || candidate.startsWith('* '))) break;
        items.push(candidate.slice(2).trim());
        idx += 1;
      }
      if (items.length > 0) {
        blocks.push({ type: 'ul', items });
      }
      continue;
    }

    const paragraph: string[] = [trimmed];
    idx += 1;
    while (idx < lines.length) {
      const next = lines[idx].trim();
      if (!next) break;
      if (
        next.startsWith('# ') ||
        next.startsWith('## ') ||
        next.startsWith('### ') ||
        next.startsWith('- ') ||
        next.startsWith('* ') ||
        next.startsWith('```')
      ) {
        break;
      }
      paragraph.push(next);
      idx += 1;
    }
    blocks.push({ type: 'p', text: paragraph.join(' ') });
  }

  return blocks;
}

function isMarkdownFile(filename: string | null): boolean {
  if (!filename) return false;
  return filename.toLowerCase().endsWith('.md') || filename.toLowerCase().endsWith('.markdown');
}

function basename(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function parentPath(path: string, fallback: string): string {
  const normalized = path.replace(/\/+$/, '');
  const idx = normalized.lastIndexOf('/');
  if (idx <= 0) return fallback;
  return normalized.slice(0, idx);
}

function MarkdownPreview({ content }: { content: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  if (blocks.length === 0) {
    return (
      <View style={styles.previewEmpty}>
        <AppText variant="body" tone="muted">No markdown content</AppText>
      </View>
    );
  }

  return (
    <ScrollView style={styles.previewScroll} contentContainerStyle={styles.previewContent}>
      {blocks.map((block, idx) => {
        if (block.type === 'h1') {
          return (
            <AppText key={`h1-${idx}`} variant="title" style={styles.mdH1}>
              {block.text}
            </AppText>
          );
        }
        if (block.type === 'h2') {
          return (
            <AppText key={`h2-${idx}`} variant="subtitle" style={styles.mdH2}>
              {block.text}
            </AppText>
          );
        }
        if (block.type === 'h3') {
          return (
            <AppText key={`h3-${idx}`} variant="label" style={styles.mdH3}>
              {block.text}
            </AppText>
          );
        }
        if (block.type === 'ul') {
          return (
            <View key={`ul-${idx}`} style={styles.mdList}>
              {block.items.map((item, itemIdx) => (
                <View key={`li-${idx}-${itemIdx}`} style={styles.mdListRow}>
                  <AppText variant="body" tone="muted" style={styles.mdListBullet}>•</AppText>
                  <AppText variant="body" style={styles.mdListText}>{item}</AppText>
                </View>
              ))}
            </View>
          );
        }
        if (block.type === 'code') {
          return (
            <View key={`code-${idx}`} style={styles.mdCodeBlock}>
              {block.language ? (
                <AppText variant="caps" tone="muted" style={styles.mdCodeLanguage}>
                  {block.language}
                </AppText>
              ) : null}
              <AppText variant="mono" style={styles.mdCodeText}>{block.content}</AppText>
            </View>
          );
        }
        return (
          <AppText key={`p-${idx}`} variant="body" style={styles.mdParagraph}>
            {block.text}
          </AppText>
        );
      })}
    </ScrollView>
  );
}

export type ProjectFilesPaneProps = {
  host: Host;
  projectName: string;
  projectPath: string;
  isActive: boolean;
};

export function ProjectFilesPane({ host, projectName, projectPath, isActive }: ProjectFilesPaneProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const isWide = width >= 1024;

  const [currentDir, setCurrentDir] = useState(projectPath);
  const [items, setItems] = useState<FileItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [fileMtimeMs, setFileMtimeMs] = useState<number | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [hasExternalChange, setHasExternalChange] = useState(false);

  const dirty = selectedFilePath !== null && fileContent !== savedContent;
  const markdown = isMarkdownFile(selectedFileName);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [items]);

  const loadDirectory = useCallback(
    async (path: string) => {
      setListLoading(true);
      setListError(null);
      try {
        const listing = await fetchFileListing(host, path);
        setCurrentDir(listing.path);
        setItems(listing.items);
      } catch (err) {
        setListError(err instanceof Error ? err.message : 'Failed to load folder');
      } finally {
        setListLoading(false);
      }
    },
    [host]
  );

  const loadFile = useCallback(
    async (path: string) => {
      setFileLoading(true);
      setFileError(null);
      setHasExternalChange(false);
      try {
        const result = await readRemoteFile(host, path);
        setSelectedFilePath(result.path);
        setSelectedFileName(result.name);
        setFileContent(result.content);
        setSavedContent(result.content);
        setFileMtimeMs(result.mtimeMs);
      } catch (err) {
        setFileError(err instanceof Error ? err.message : 'Failed to read file');
      } finally {
        setFileLoading(false);
      }
    },
    [host]
  );

  const handleSave = useCallback(async () => {
    if (!selectedFilePath || saving) return;
    setSaving(true);
    setFileError(null);
    try {
      const result = await writeRemoteFile(host, selectedFilePath, fileContent, fileMtimeMs ?? undefined);
      setSavedContent(fileContent);
      setFileMtimeMs(result.mtimeMs);
      setHasExternalChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      setFileError(message);
      Alert.alert('Save failed', 'The file may have changed on disk. Reloading latest content.');
      await loadFile(selectedFilePath);
    } finally {
      setSaving(false);
    }
  }, [fileContent, fileMtimeMs, host, loadFile, saving, selectedFilePath]);

  useEffect(() => {
    loadDirectory(projectPath);
  }, [loadDirectory, projectPath]);

  useEffect(() => {
    if (!isActive || !selectedFilePath || fileMtimeMs === null) return;
    const id = setInterval(async () => {
      try {
        const remote = await statRemoteFile(host, selectedFilePath);
        if (remote.mtimeMs === fileMtimeMs) return;
        if (dirty) {
          setHasExternalChange(true);
          return;
        }
        const latest = await readRemoteFile(host, selectedFilePath);
        setFileContent(latest.content);
        setSavedContent(latest.content);
        setFileMtimeMs(latest.mtimeMs);
        setHasExternalChange(false);
      } catch {
        // Keep silent during polling failures.
      }
    }, 2500);
    return () => clearInterval(id);
  }, [dirty, fileMtimeMs, host, isActive, selectedFilePath]);

  return (
    <View style={styles.windowContainer}>
      <View style={styles.windowHeader}>
        <View style={styles.windowHeaderMain}>
          <AppText variant="title" numberOfLines={1}>Files</AppText>
          <AppText variant="label" tone="muted" numberOfLines={1}>
            {projectName}
          </AppText>
        </View>
        <Pressable style={styles.headerButton} onPress={() => loadDirectory(currentDir)}>
          <RefreshCw size={16} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.pathBar}>
        <Folder size={14} color={colors.textMuted} style={{ marginRight: 8 }} />
        <AppText variant="mono" tone="muted" numberOfLines={1} style={{ flex: 1 }}>{currentDir}</AppText>
      </View>

      <View style={[styles.contentLayout, isWide && styles.contentLayoutWide]}>
        <View
          style={[
            styles.filesPane,
            isWide && styles.filesPaneWide,
            !selectedFilePath && styles.filesPaneExpanded,
          ]}
        >
          <View style={styles.filesPaneHeader}>
            <AppText variant="caps" tone="muted">Explorer</AppText>
            <Pressable
              style={[styles.smallButton, currentDir === projectPath && styles.smallButtonDisabled]}
              onPress={() => loadDirectory(parentPath(currentDir, projectPath))}
              disabled={currentDir === projectPath}
            >
              <ChevronUp size={14} color={currentDir === projectPath ? colors.textMuted : colors.text} />
            </Pressable>
          </View>

          {listLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : listError ? (
            <View style={styles.centered}>
              <AppText variant="body" tone="error" style={styles.errorText}>{listError}</AppText>
            </View>
          ) : (
            <ScrollView style={styles.filesScroll}>
              {sortedItems.map((item) => {
                const active = selectedFilePath === item.path;
                return (
                  <Pressable
                    key={item.path}
                    style={[styles.fileRow, active && styles.fileRowActive]}
                    onPress={() => {
                      if (item.isDirectory) {
                        loadDirectory(item.path);
                        return;
                      }
                      loadFile(item.path);
                    }}
                  >
                    {item.isDirectory ? (
                      <Folder size={15} color={colors.accent} />
                    ) : (
                      <FileCode2 size={15} color={colors.textMuted} />
                    )}
                    <View style={styles.fileRowText}>
                      <AppText variant="body" numberOfLines={1}>{item.name}</AppText>
                      {!item.isDirectory ? (
                        <AppText variant="caps" tone="muted" style={styles.fileMeta}>
                          {Math.round(item.size / 1024)} KB
                        </AppText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
              {sortedItems.length === 0 && (
                <View style={[styles.centeredInline, { flex: 1, gap: 8 }]}>
                  <Folder size={24} color={withAlpha(colors.text, 0.1)} />
                  <AppText variant="body" tone="muted">Empty folder</AppText>
                </View>
              )}
            </ScrollView>
          )}
        </View>

        {selectedFilePath ? (
          <View style={styles.editorPane}>
            <View style={styles.editorHeader}>
              <View style={styles.editorHeaderMain}>
                <AppText variant="subtitle" numberOfLines={1}>{selectedFileName ?? basename(selectedFilePath)}</AppText>
                <AppText variant="mono" tone="muted" numberOfLines={1}>{selectedFilePath}</AppText>
              </View>

              <View style={styles.editorActions}>
                {markdown ? (
                  <Pressable style={styles.smallButton} onPress={() => setPreviewMode((prev) => !prev)}>
                    {previewMode ? (
                      <Pencil size={14} color={colors.text} />
                    ) : (
                      <Eye size={14} color={colors.text} />
                    )}
                  </Pressable>
                ) : null}
                <Pressable
                  style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]}
                  onPress={handleSave}
                  disabled={!dirty || saving}
                >
                  <Save size={14} color={(!dirty || saving) ? colors.textMuted : colors.accentText} />
                  <AppText
                    variant="caps"
                    style={(!dirty || saving) ? styles.saveButtonTextDisabled : styles.saveButtonText}
                  >
                    {saving ? 'Saving' : 'Save'}
                  </AppText>
                </Pressable>
              </View>
            </View>

            {hasExternalChange ? (
              <View style={styles.warningBanner}>
                <AppText variant="label" tone="warning" style={styles.warningText}>
                  This file changed on disk while you were editing.
                </AppText>
                <Pressable
                  style={styles.warningAction}
                  onPress={() => selectedFilePath && loadFile(selectedFilePath)}
                >
                  <AppText variant="caps" style={styles.warningActionText}>Reload</AppText>
                </Pressable>
              </View>
            ) : null}

            {fileError ? (
              <View style={styles.errorBanner}>
                <AppText variant="label" tone="error">{fileError}</AppText>
              </View>
            ) : null}

            {fileLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : previewMode && markdown ? (
              <MarkdownPreview content={fileContent} />
            ) : (
              <TextInput
                style={styles.editorInput}
                value={fileContent}
                onChangeText={setFileContent}
                multiline
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
              />
            )}
          </View>
        ) : (
          <View style={styles.emptyEditor}>
            <FileCode2 size={48} color={withAlpha(colors.text, 0.1)} style={{ marginBottom: 16 }} />
            <AppText variant="body" tone="muted" style={{ fontWeight: '500' }}>
              Select a file to read or edit
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

export function ProjectFilesWindow() {
  const { params, isActive } = useWindowActions();
  const { hosts } = useStore();
  const host = params.hostId ? hosts.find((item) => item.id === params.hostId) : null;
  const projectPath = params.projectPath ?? '';
  const projectName = params.projectName ?? 'Project';

  if (!host || !projectPath) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <AppText variant="subtitle">Project not available</AppText>
      </View>
    );
  }

  return (
    <ProjectFilesPane
      host={host}
      projectName={projectName}
      projectPath={projectPath}
      isActive={isActive}
    />
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    windowContainer: {
      flex: 1,
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
      backgroundColor: 'transparent',
    },
    windowHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
      marginBottom: theme.spacing.xs,
    },
    windowHeaderMain: {
      flex: 1,
      gap: 4,
    },
    headerButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    pathBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: theme.radii.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.03,
      shadowRadius: 2,
      elevation: 1,
    },
    contentLayout: {
      flex: 1,
      gap: theme.spacing.md,
    },
    contentLayoutWide: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    filesPane: {
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      minHeight: 220,
      maxHeight: 320,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 3,
    },
    filesPaneWide: {
      flex: 0.35,
      minHeight: 0,
      maxHeight: undefined,
    },
    filesPaneExpanded: {
      flex: 1,
      maxHeight: undefined,
    },
    filesPaneHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: withAlpha(colors.text, 0.01),
    },
    smallButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    smallButtonDisabled: {
      opacity: 0.4,
    },
    filesScroll: {
      flex: 1,
    },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: withAlpha(colors.border, 0.5),
    },
    fileRowActive: {
      backgroundColor: withAlpha(colors.accent, 0.08),
    },
    fileRowText: {
      flex: 1,
      gap: 2,
    },
    fileMeta: {
      fontSize: 11,
    },
    editorPane: {
      flex: 1,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 3,
    },
    editorHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: withAlpha(colors.text, 0.01),
    },
    editorHeaderMain: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    editorActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.accent,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 2,
    },
    saveButtonDisabled: {
      backgroundColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    saveButtonText: {
      color: colors.accentText,
      fontSize: 11,
      fontWeight: '600',
    },
    saveButtonTextDisabled: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    editorInput: {
      flex: 1,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      color: colors.text,
      fontFamily: 'JetBrainsMono_500Medium',
      fontSize: 14,
      lineHeight: 22,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    centeredInline: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xl,
    },
    emptyEditor: {
      flex: 1,
      borderRadius: theme.radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      padding: theme.spacing.xl,
      borderStyle: 'dashed',
    },
    warningBanner: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 10,
      backgroundColor: withAlpha(colors.orange, 0.1),
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.orange, 0.2),
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    warningText: {
      flex: 1,
    },
    warningAction: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: withAlpha(colors.orange, 0.3),
    },
    warningActionText: {
      color: colors.orange,
      fontSize: 11,
      fontWeight: '600',
    },
    errorBanner: {
      paddingHorizontal: theme.spacing.md,
      paddingVertical: 10,
      backgroundColor: withAlpha(colors.red, 0.1),
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(colors.red, 0.2),
    },
    errorText: {
      textAlign: 'center',
    },
    previewScroll: {
      flex: 1,
    },
    previewContent: {
      padding: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    previewEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    mdH1: {
      fontSize: 28,
      fontWeight: '700',
      marginBottom: 8,
    },
    mdH2: {
      fontSize: 22,
      fontWeight: '600',
      marginTop: 12,
      marginBottom: 6,
    },
    mdH3: {
      fontSize: 16,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 8,
      marginBottom: 4,
    },
    mdParagraph: {
      lineHeight: 24,
      color: colors.textSecondary,
      fontSize: 15,
    },
    mdList: {
      gap: 8,
      paddingLeft: 4,
    },
    mdListRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    mdListBullet: {
      marginTop: 2,
      fontSize: 16,
    },
    mdListText: {
      flex: 1,
      lineHeight: 24,
      fontSize: 15,
      color: colors.textSecondary,
    },
    mdCodeBlock: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: withAlpha(colors.text, 0.03),
      padding: theme.spacing.md,
      gap: 8,
      marginVertical: 4,
    },
    mdCodeLanguage: {
      fontSize: 11,
      fontWeight: '600',
    },
    mdCodeText: {
      color: colors.textSecondary,
      lineHeight: 20,
      fontSize: 13,
    },
  });
