import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AlertType, RetailerAlert } from '@optiworld/shared';

import { AppHeader, EmptyState, SkeletonCard } from '../../components/shared';
import { loadOrgAlerts, markAllOrgAlertsRead } from '../../services/alerts';
import { colors } from '../../theme/colors';

const TABS = ['All', 'Critical', 'Orders', 'Lab', 'Stock'] as const;
type AlertTab = (typeof TABS)[number];

type AlertsScreenProps = {
  onAction?: (alert: RetailerAlert) => void;
};

export function AlertsScreen({ onAction }: AlertsScreenProps): React.ReactElement {
  const navigation = useNavigation();
  const [tab, setTab] = useState<AlertTab>('All');
  const [alerts, setAlerts] = useState<RetailerAlert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setAlerts(await loadOrgAlerts());
      setError(null);
    } catch (caught) {
      setAlerts([]);
      setError(caught instanceof Error ? caught.message : 'Alerts could not be loaded');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = (alerts ?? []).filter((alert) => matchesTab(tab, alert.type));
  const unread = alerts?.some((alert) => !alert.isRead) ?? false;

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Alerts"
        onBack={() => navigation.goBack()}
        right={
          <Pressable
            accessibilityRole="button"
            disabled={!unread}
            onPress={() => {
              void markAllOrgAlertsRead()
                .then(() => refresh())
                .catch((caught: unknown) => {
                  setError(
                    caught instanceof Error ? caught.message : 'Alerts could not be updated',
                  );
                });
            }}
            style={styles.mark}
          >
            <Text style={[styles.markText, !unread && styles.markOff]}>Mark all read</Text>
          </Pressable>
        }
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
        style={styles.tabBar}
      >
        {TABS.map((item) => (
          <Pressable
            key={item}
            accessibilityRole="button"
            onPress={() => setTab(item)}
            style={[styles.tab, tab === item && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === item && styles.tabTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh().finally(() => setRefreshing(false));
            }}
          />
        }
        style={styles.screen}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {alerts === null ? <SkeletonCard /> : null}
        {alerts && visible.length === 0 ? (
          <EmptyState description={emptyCopy(tab)} title={`No ${tab.toLowerCase()} alerts`} />
        ) : null}
        {visible.map((alert) => {
          const action = actionLabel(alert);
          return (
            <View
              key={alert.id}
              style={[
                styles.card,
                { borderLeftColor: borderColor(alert.type) },
                alert.isRead && styles.read,
              ]}
            >
              <View style={styles.row}>
                <Text style={styles.icon}>{iconFor(alert.type)}</Text>
                <View style={styles.copy}>
                  <Text style={styles.title}>{alert.title}</Text>
                  <Text style={styles.body}>{alert.body}</Text>
                </View>
              </View>
              {action && onAction ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onAction(alert)}
                  style={styles.action}
                >
                  <Text style={styles.actionText}>{action}</Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function matchesTab(tab: AlertTab, type: AlertType): boolean {
  if (tab === 'All') {
    return true;
  }
  if (tab === 'Critical') {
    return type === 'PAYMENT_OVERDUE' || type === 'PAYMENT_DUE' || type === 'INVOICE_REVIEW';
  }
  if (tab === 'Orders') {
    return type.startsWith('ORDER_');
  }
  if (tab === 'Lab') {
    return type.startsWith('LAB_');
  }
  return type === 'LOW_STOCK';
}

function actionLabel(alert: RetailerAlert): string | null {
  if (alert.type === 'LOW_STOCK') {
    return 'View inventory';
  }
  if (
    (alert.type === 'PAYMENT_DUE' || alert.type === 'PAYMENT_OVERDUE') &&
    alert.relatedEntityType === 'Customer'
  ) {
    return 'View customer';
  }
  if (alert.type.startsWith('LAB_') && alert.relatedEntityId) {
    return 'View job';
  }
  if (alert.type.startsWith('ORDER_') && alert.relatedEntityId) {
    return 'View order';
  }
  return null;
}

function iconFor(type: AlertType): string {
  if (type === 'LOW_STOCK') {
    return 'S';
  }
  if (type === 'PAYMENT_DUE' || type === 'PAYMENT_OVERDUE' || type === 'INVOICE_REVIEW') {
    return '!';
  }
  if (type.startsWith('LAB_')) {
    return 'L';
  }
  return 'O';
}

function borderColor(type: AlertType): string {
  if (type === 'PAYMENT_OVERDUE') {
    return colors.red;
  }
  if (type === 'LOW_STOCK' || type === 'PAYMENT_DUE' || type === 'INVOICE_REVIEW') {
    return colors.amber;
  }
  if (type === 'LAB_JOB_READY' || type === 'ORDER_DELIVERED' || type === 'ORDER_DISPATCHED') {
    return colors.teal;
  }
  return colors.blue;
}

function emptyCopy(tab: AlertTab): string {
  if (tab === 'Critical') {
    return 'Overdue payments and invoices that need review show up here.';
  }
  if (tab === 'Orders') {
    return 'Order updates show up here.';
  }
  if (tab === 'Lab') {
    return 'Laboratory updates show up here.';
  }
  if (tab === 'Stock') {
    return 'Items at or below their threshold show up here.';
  }
  return 'Shop notices show up here.';
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.canvas, flex: 1 },
  mark: { alignItems: 'flex-end', justifyContent: 'center', minHeight: 44 },
  markText: { color: colors.blue, fontSize: 14, fontWeight: '600' },
  markOff: { color: colors.ink3 },
  tabBar: { flexGrow: 0, backgroundColor: colors.canvas },
  tabs: { gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  tab: {
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 12,
    backgroundColor: colors.white,
  },
  tabOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  tabText: { color: colors.ink2, fontSize: 15, fontWeight: '600' },
  tabTextOn: { color: colors.white },
  content: { gap: 8, paddingBottom: 16 },
  error: { color: colors.red, fontSize: 14, marginHorizontal: 12 },
  card: {
    backgroundColor: colors.white,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 12,
    padding: 12,
  },
  read: { opacity: 0.7 },
  row: { flexDirection: 'row', gap: 10 },
  icon: {
    backgroundColor: colors.canvas,
    borderRadius: 14,
    color: colors.ink2,
    fontSize: 14,
    fontWeight: '700',
    height: 28,
    lineHeight: 28,
    overflow: 'hidden',
    textAlign: 'center',
    width: 28,
  },
  copy: { flex: 1 },
  title: { color: colors.ink, fontSize: 16, fontWeight: '600' },
  body: { color: colors.ink2, fontSize: 14, marginTop: 4 },
  action: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 8, minHeight: 44 },
  actionText: { color: colors.blue, fontSize: 15, fontWeight: '600' },
});
