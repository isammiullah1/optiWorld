import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Local POS tables. Invoice ids are UUID v4 values from the device.
 * server_id is filled after a successful push. Customer and inventory rows
 * are a read-only cache replaced by pull.
 */
export const posSchema = appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: 'local_invoices',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'org_id', type: 'string', isOptional: true },
        { name: 'customer_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'customer_name', type: 'string', isOptional: true },
        { name: 'invoice_number', type: 'number', isOptional: true },
        { name: 'status', type: 'string' },
        { name: 'payment_type', type: 'string' },
        { name: 'total', type: 'string' },
        { name: 'discount', type: 'string' },
        { name: 'sync_status', type: 'string', isIndexed: true },
        { name: 'needs_review', type: 'boolean' },
        { name: 'review_reason', type: 'string', isOptional: true },
        { name: 'lab_job', type: 'string', isOptional: true },
        { name: 'issued_at', type: 'number' },
        { name: 'created_at', type: 'number', isOptional: true },
        { name: 'updated_at', type: 'number', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'local_invoice_items',
      columns: [
        { name: 'invoice_id', type: 'string', isIndexed: true },
        { name: 'inventory_batch_id', type: 'string', isIndexed: true },
        { name: 'product_name', type: 'string' },
        { name: 'price_code', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit_price', type: 'string' },
        { name: 'sale_price', type: 'string' },
        { name: 'stock_shortfall', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'local_customers',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'name', type: 'string' },
        { name: 'phone', type: 'string', isOptional: true },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'credit_limit', type: 'string' },
        { name: 'outstanding_balance', type: 'string', isOptional: true },
        { name: 'updated_at', type: 'number' },
        { name: 'last_synced_at', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'local_inventory',
      columns: [
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'price_code', type: 'string' },
        { name: 'prefix', type: 'string' },
        { name: 'product_name', type: 'string' },
        { name: 'category', type: 'string' },
        { name: 'sale_price', type: 'string' },
        { name: 'stock_qty', type: 'number' },
        { name: 'low_stock_threshold', type: 'number' },
        { name: 'updated_at', type: 'number' },
        { name: 'last_synced_at', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'local_sync_state',
      columns: [{ name: 'last_synced_at', type: 'string', isOptional: true }],
    }),
  ],
});
