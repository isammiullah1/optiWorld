import {
  addColumns,
  createTable,
  schemaMigrations,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

export const posMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'local_invoices',
          columns: [
            { name: 'org_id', type: 'string', isOptional: true },
            { name: 'customer_name', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number', isOptional: true },
            { name: 'updated_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'local_customers',
          columns: [
            { name: 'server_id', type: 'string', isOptional: true },
            { name: 'outstanding_balance', type: 'string', isOptional: true },
            { name: 'last_synced_at', type: 'string', isOptional: true },
          ],
        }),
        createTable({
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
        unsafeExecuteSql(`
          insert into local_inventory (
            id, server_id, price_code, prefix, product_name, category, sale_price,
            stock_qty, low_stock_threshold, updated_at, last_synced_at
          )
          select
            id, id, price_code, prefix, product_name, category, sale_price,
            stock_qty, low_stock_threshold, updated_at, ''
          from local_inventory_batches
        `),
        unsafeExecuteSql('drop table local_inventory_batches'),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'local_invoices',
          columns: [{ name: 'lab_job', type: 'string', isOptional: true }],
        }),
      ],
    },
  ],
});
