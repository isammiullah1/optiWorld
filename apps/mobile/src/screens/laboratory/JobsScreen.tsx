import { useCallback, useEffect, useState } from 'react';
import {
  PanResponder,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  isProcessingStatus,
  JOB_STATUS_LABEL,
  NEXT_LAB_STATUS,
  type JobStatus,
  type LabBoardJob,
  type LabKanbanCard,
} from '@optiworld/shared';

import {
  advanceLaboratoryJob,
  loadLaboratoryJob,
  loadLaboratoryJobs,
  saveLaboratoryNotes,
  setLaboratoryUrgent,
} from '../../services/laboratory-jobs';
import { colors } from '../../theme/colors';

const TABS = [
  { id: 'new', label: 'New', statuses: ['SUBMITTED', 'CONFIRMED', 'REJECTED'] },
  { id: 'received', label: 'Received', statuses: ['RECEIVED'] },
  { id: 'progress', label: 'Processing', statuses: ['CUTTING', 'FITTING', 'QC'] },
  { id: 'ready', label: 'Ready', statuses: ['READY'] },
  { id: 'done', label: 'Done', statuses: ['DISPATCHED'] },
] as const;

const NEXT = NEXT_LAB_STATUS;

function jobMatchesTab(status: JobStatus, tab: (typeof TABS)[number]['id']): boolean {
  if (tab === 'new') {
    return status === 'SUBMITTED' || status === 'CONFIRMED' || status === 'REJECTED';
  }
  if (tab === 'received') {
    return status === 'RECEIVED';
  }
  if (tab === 'progress') {
    return isProcessingStatus(status);
  }
  if (tab === 'ready') {
    return status === 'READY';
  }
  return status === 'DISPATCHED';
}

const LABELS = JOB_STATUS_LABEL;

export function JobsScreen(): React.ReactElement {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('new');
  const [jobs, setJobs] = useState<LabKanbanCard[]>([]);
  const [selected, setSelected] = useState<LabBoardJob | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const board = await loadLaboratoryJobs();
      setJobs(board.jobs);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Jobs could not be loaded');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (selected) {
    return (
      <JobDetail
        job={selected}
        onBack={() => setSelected(null)}
        onChanged={async (jobId) => {
          setSelected(await loadLaboratoryJob(jobId));
          await refresh();
        }}
      />
    );
  }

  const visible = jobs.filter((job) => jobMatchesTab(job.status, tab));

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
    >
      <Text style={styles.title}>Jobs</Text>
      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => setTab(item.id)}
            style={[styles.tab, tab === item.id ? styles.tabOn : null]}
          >
            <Text style={tab === item.id ? styles.tabOnText : styles.tabText}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {visible.length === 0 ? <Text style={styles.meta}>No jobs in this stage.</Text> : null}
      {visible.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          onOpen={() => {
            void loadLaboratoryJob(job.id)
              .then(setSelected)
              .catch((caught: unknown) => {
                setError(
                  caught instanceof Error ? caught.message : 'Job detail could not be loaded',
                );
              });
          }}
          onAdvance={() => {
            const next = NEXT[job.status];
            if (!next) {
              return;
            }
            void advanceLaboratoryJob(job.id, next).then(() => refresh());
          }}
        />
      ))}
    </ScrollView>
  );
}

function JobCard({
  job,
  onOpen,
  onAdvance,
}: {
  job: LabKanbanCard;
  onOpen: () => void;
  onAdvance: () => void;
}): React.ReactElement {
  const next = NEXT[job.status];
  const pan = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) =>
      Math.abs(gesture.dx) > 24 && Math.abs(gesture.dy) < 20,
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 60) {
        onAdvance();
      } else if (gesture.dx < -60) {
        onOpen();
      }
    },
  });
  return (
    <View {...pan.panHandlers} style={styles.card}>
      <Text style={styles.ref}>{job.referenceNumber}</Text>
      <Text style={styles.name}>{job.patientName}</Text>
      <Text style={styles.meta}>
        via {job.retailerName ?? 'Walk-in'} · {LABELS[job.status]}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {job.rxSummary}
      </Text>
      {job.isUrgent ? <Text style={styles.urgent}>Urgent</Text> : null}
      {next ? (
        <Pressable onPress={onAdvance} style={styles.button}>
          <Text style={styles.buttonText}>Move to {LABELS[next]}</Text>
        </Pressable>
      ) : null}
      <Text style={styles.hint}>Swipe right to advance · swipe left for detail</Text>
    </View>
  );
}

function JobDetail({
  job,
  onBack,
  onChanged,
}: {
  job: LabBoardJob;
  onBack: () => void;
  onChanged: (jobId: string) => Promise<void>;
}): React.ReactElement {
  const [notes, setNotes] = useState(job.notes ?? '');
  const next = NEXT[job.status];
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.button}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
      <Text style={styles.ref}>{job.referenceNumber}</Text>
      <Text style={styles.name}>{job.patientName}</Text>
      <Text style={styles.meta}>
        via {job.retailerName ?? 'Walk-in'} · {LABELS[job.status]}
      </Text>
      <Text style={styles.meta}>
        R {job.prescription.right.sphere || '—'} / {job.prescription.right.cylinder || '—'} ×{' '}
        {job.prescription.right.axis || '—'}
      </Text>
      <Text style={styles.meta}>
        L {job.prescription.left.sphere || '—'} / {job.prescription.left.cylinder || '—'} ×{' '}
        {job.prescription.left.axis || '—'}
      </Text>
      <Text style={styles.meta}>
        ADD {job.prescription.add || '—'} · PD {job.prescription.pd || '—'}
      </Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        multiline
        style={styles.input}
        placeholder="Internal lab notes"
      />
      <Pressable
        onPress={() => {
          void saveLaboratoryNotes(job.id, notes).then(() => onChanged(job.id));
        }}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>Save notes</Text>
      </Pressable>
      {next ? (
        <Pressable
          onPress={() => {
            void advanceLaboratoryJob(job.id, next).then(() => onChanged(job.id));
          }}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Move to {LABELS[next]}</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          void setLaboratoryUrgent(job.id, !job.isUrgent).then(() => onChanged(job.id));
        }}
        style={styles.secondary}
      >
        <Text style={styles.secondaryText}>{job.isUrgent ? 'Clear urgent' : 'Flag urgent'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '600' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  tabOn: { backgroundColor: colors.blueSoft, borderColor: colors.blue },
  tabText: { color: colors.ink2, fontSize: 14 },
  tabOnText: { color: colors.blue, fontSize: 14, fontWeight: '600' },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  ref: { color: colors.blue, fontSize: 16, fontWeight: '600' },
  name: { color: colors.ink, fontSize: 16 },
  meta: { color: colors.ink3, fontSize: 14 },
  urgent: { color: colors.red, fontSize: 13, fontWeight: '600' },
  hint: { color: colors.ink3, fontSize: 13, marginTop: 4 },
  button: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '600' },
  secondary: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: colors.ink2, fontSize: 15 },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    color: colors.ink,
    backgroundColor: colors.white,
    textAlignVertical: 'top',
  },
  error: { color: colors.red, fontSize: 15 },
});
