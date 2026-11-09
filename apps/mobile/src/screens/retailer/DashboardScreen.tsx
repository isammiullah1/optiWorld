import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { DashboardStats, RetailerAlert, RetailerInvoiceRow } from '@optiworld/shared';
import { format, formatDistanceToNow } from 'date-fns';

import { loadMobileDashboard } from '../../services/retailer-dashboard';
import { colors } from '../../theme/colors';

export type DashboardTarget =
  | 'new-invoice'
  | 'customers'
  | 'inventory'
  | 'alerts'
  | 'jobs'
  | 'laboratories'
  | 'wholesalers'
  | 'orders'
  | { invoiceId: string };

type DashboardScreenProps = {
  userName: string;
  onOpen: (target: DashboardTarget) => void;
};

export function DashboardScreen({ userName, onOpen }: DashboardScreenProps): React.ReactElement {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [invoices, setInvoices] = useState<RetailerInvoiceRow[]>([]);
  const [alerts, setAlerts] = useState<RetailerAlert[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    const next = await loadMobileDashboard();
    setStats(next.stats);
    setInvoices(next.invoices);
    setAlerts(next.alerts);
    setUnread(next.unreadAlertCount);
    setError(null);
  }, []);

  useEffect(() => {
    void load().catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : 'The dashboard could not be loaded.');
    });
  }, [load]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load()
                .catch((reason: unknown) => {
                  setError(
                    reason instanceof Error ? reason.message : 'The dashboard could not be loaded.',
                  );
                })
                .finally(() => setRefreshing(false));
            }}
          />
        }
      >
        {error ? (
          <Text style={styles.error} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View style={styles.hero}>
          <Text style={styles.greeting}>
            {greeting(new Date())}, {firstName(userName)}
          </Text>
          <View style={styles.heroRow}>
            <HeroStat label="Today's sales" value={stats ? formatMoney(stats.todaySales) : '—'} />
            <HeroStat
              label="Outstanding"
              value={stats ? formatMoney(stats.outstandingDues) : '—'}
            />
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.primary}
          onPress={() => onOpen('new-invoice')}
        >
          <Text style={styles.primaryText}>New Invoice</Text>
        </Pressable>
        <View style={styles.grid}>
          <QuickAction label="Customer lookup" onPress={() => onOpen('customers')} />
          <QuickAction label="Inventory" onPress={() => onOpen('inventory')} />
          <QuickAction label="Alerts" badge={unread} onPress={() => onOpen('alerts')} />
          <QuickAction label="Lab jobs" onPress={() => onOpen('jobs')} />
          <QuickAction label="Laboratories" onPress={() => onOpen('laboratories')} />
          <QuickAction label="Wholesalers" onPress={() => onOpen('wholesalers')} />
          <QuickAction label="Orders" onPress={() => onOpen('orders')} />
        </View>
        <Text style={styles.section}>Recent alerts</Text>
        <View style={styles.card}>
          {alerts.length === 0 ? <Text style={styles.muted}>No unread alerts.</Text> : null}
          {alerts.map((alert) => (
            <View key={alert.id} style={styles.alertRow}>
              <View style={[styles.dot, { backgroundColor: dotColor(alert.type) }]} />
              <View style={styles.alertCopy}>
                <Text style={styles.body}>{alert.title}</Text>
                <Text style={styles.muted}>
                  {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.section}>Recent invoices</Text>
        <View style={styles.card}>
          {invoices.length === 0 ? <Text style={styles.muted}>No invoices yet.</Text> : null}
          {invoices.map((invoice) => (
            <Pressable
              key={invoice.id}
              accessibilityRole="button"
              style={styles.invoiceRow}
              onPress={() => onOpen({ invoiceId: invoice.id })}
            >
              <View>
                <Text style={styles.body}>{invoice.customerName}</Text>
                <Text style={styles.muted}>
                  #{invoice.invoiceNumber} · {format(new Date(invoice.issuedAt), 'd MMM yyyy')}
                </Text>
              </View>
              <Text style={styles.body}>{formatMoney(invoice.amount)}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function HeroStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={styles.heroStat}>
      <Text style={styles.heroLabel}>{label}</Text>
      <Text style={styles.heroValue}>{value}</Text>
    </View>
  );
}

function QuickAction({
  label,
  badge = 0,
  onPress,
}: {
  label: string;
  badge?: number;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable accessibilityRole="button" style={styles.action} onPress={onPress}>
      <Text style={styles.body}>{label}</Text>
      {badge > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function formatMoney(value: string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return value;
  }
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function greeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

function firstName(name: string): string {
  const [first] = name.trim().split(/\s+/);
  return first && first.length > 0 ? first : 'there';
}

function dotColor(type: RetailerAlert['type']): string {
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 16, gap: 12 },
  hero: { backgroundColor: colors.navy, borderRadius: 12, padding: 16 },
  greeting: { color: 'rgba(255,255,255,0.75)', fontSize: 15 },
  heroRow: { flexDirection: 'row', marginTop: 12 },
  heroStat: { flex: 1 },
  heroLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textTransform: 'uppercase' },
  heroValue: { color: colors.white, fontSize: 24, fontWeight: '600', marginTop: 4 },
  primary: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.white, fontSize: 16, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  action: {
    width: '47%',
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    padding: 12,
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: colors.blue,
    borderRadius: 99,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '600' },
  section: { color: colors.ink, fontSize: 18, fontWeight: '600', marginTop: 4 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 10,
  },
  alertRow: { flexDirection: 'row', gap: 8 },
  alertCopy: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  invoiceRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  body: { color: colors.ink, fontSize: 15 },
  muted: { color: colors.ink3, fontSize: 14, marginTop: 2 },
  error: { color: colors.red, fontSize: 15 },
});
