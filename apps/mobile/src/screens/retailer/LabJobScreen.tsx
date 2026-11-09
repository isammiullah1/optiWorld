import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import {
  isProcessingStatus,
  JOB_STATUS_LABEL,
  type JobStatus,
  type LabJobDetail,
} from '@optiworld/shared';

import { loadLabJob, setLabJobNotify } from '../../services/lab-jobs';
import { colors } from '../../theme/colors';

const STAGES = ['SUBMITTED', 'CONFIRMED', 'RECEIVED', 'PROCESSING', 'READY', 'DISPATCHED'] as const;

function stageIndex(status: JobStatus): number {
  if (isProcessingStatus(status)) {
    return STAGES.indexOf('PROCESSING');
  }
  const index = STAGES.indexOf(status as (typeof STAGES)[number]);
  return index;
}

export function LabJobScreen({
  jobId,
  onBack,
}: {
  jobId: string;
  onBack: () => void;
}): React.ReactElement {
  const [job, setJob] = useState<LabJobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadLabJob(jobId)
      .then(setJob)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'This lab job could not be loaded'),
      );
  }, [jobId]);

  const current = job ? stageIndex(job.status) : -1;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack} style={styles.back}>
        <Text style={styles.link}>Back</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {job ? (
        <>
          <Text style={styles.reference}>{job.referenceNumber}</Text>
          <Text style={styles.name}>{job.patientName}</Text>
          <Text style={styles.meta}>
            {job.lab.name}
            {job.lab.phone ? ` · ${job.lab.phone}` : ''}
          </Text>
          <Text style={styles.name}>{JOB_STATUS_LABEL[job.status]}</Text>
          <View style={styles.row}>
            {STAGES.map((stage, index) => (
              <View key={stage} style={[styles.stage, index <= current && styles.stageOn]} />
            ))}
          </View>
          <Text style={styles.meta}>
            R {job.prescription.right.sphere || '—'} / {job.prescription.right.cylinder || '—'} /{' '}
            {job.prescription.right.axis || '—'}
          </Text>
          <Text style={styles.meta}>
            L {job.prescription.left.sphere || '—'} / {job.prescription.left.cylinder || '—'} /{' '}
            {job.prescription.left.axis || '—'}
          </Text>
          <Text style={styles.meta}>
            Add {job.prescription.add || '—'} · PD {job.prescription.pd || '—'}
          </Text>
          {job.history.map((entry) => (
            <Text key={entry.id} style={styles.meta}>
              {entry.action} {entry.changedByName}
            </Text>
          ))}
          <View style={styles.header}>
            <Text style={styles.name}>WhatsApp updates</Text>
            <Switch
              value={job.notifyWhatsapp}
              onValueChange={(notifyWhatsapp) => {
                void setLabJobNotify(job.id, notifyWhatsapp)
                  .then((next) => setJob({ ...job, notifyWhatsapp: next }))
                  .catch((caught: unknown) =>
                    setError(caught instanceof Error ? caught.message : 'Could not save'),
                  );
              }}
            />
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 8 },
  back: { minHeight: 44, justifyContent: 'center' },
  reference: { color: colors.ink, fontSize: 24, fontWeight: '600' },
  name: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  meta: { color: colors.ink2, fontSize: 14 },
  link: { color: colors.blue, fontSize: 16 },
  error: { color: colors.red, fontSize: 15 },
  row: { flexDirection: 'row', gap: 4, marginVertical: 8 },
  stage: { flex: 1, height: 6, borderRadius: 99, backgroundColor: colors.line },
  stageOn: { backgroundColor: colors.blue },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
});
