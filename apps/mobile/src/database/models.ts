import { Model } from '@nozbe/watermelondb';
import { field, text } from '@nozbe/watermelondb/decorators';

export class LocalInvoice extends Model {
  static override table = 'local_invoices';

  @text('server_id') serverId = '';
  @text('org_id') orgId = '';
  @field('invoice_number') invoiceNumber = 0;
  @text('customer_id') customerId = '';
  @text('customer_name') customerName = '';
  @text('status') status = '';
  @text('payment_type') paymentType = '';
  @text('total') total = '0.00';
  @text('discount') discount = '0.00';
  @text('sync_status') saleSyncStatus = 'PENDING';
  @field('needs_review') needsReview = false;
  @text('review_reason') reviewReason = '';
  @text('lab_job') labJob = '';
  @field('issued_at') issuedAt = 0;
  @field('created_at') createdAt = 0;
  @field('updated_at') updatedAt = 0;
}

export class LocalInvoiceItem extends Model {
  static override table = 'local_invoice_items';

  @text('invoice_id') invoiceId = '';
  @text('inventory_batch_id') inventoryBatchId = '';
  @text('product_name') productName = '';
  @text('price_code') priceCode = '';
  @field('quantity') quantity = 0;
  @text('unit_price') unitPrice = '0.00';
  @text('sale_price') salePrice = '0.00';
  @field('stock_shortfall') stockShortfall = 0;
}

export class LocalCustomer extends Model {
  static override table = 'local_customers';

  @text('server_id') serverId = '';
  @text('name') name = '';
  @text('phone') phone = '';
  @text('email') email = '';
  @text('credit_limit') creditLimit = '0.00';
  @text('outstanding_balance') outstandingBalance = '0.00';
  @field('updated_at') updatedAt = 0;
  @text('last_synced_at') lastSyncedAt = '';
}

export class LocalInventoryBatch extends Model {
  static override table = 'local_inventory';

  @text('server_id') serverId = '';
  @text('price_code') priceCode = '';
  @text('prefix') prefix = '';
  @text('product_name') productName = '';
  @text('category') category = '';
  @text('sale_price') salePrice = '0.00';
  @field('stock_qty') stockQty = 0;
  @field('low_stock_threshold') lowStockThreshold = 0;
  @field('updated_at') updatedAt = 0;
  @text('last_synced_at') lastSyncedAt = '';
}

export class LocalSyncState extends Model {
  static override table = 'local_sync_state';

  @text('last_synced_at') lastSyncedAt = '';
}

export const posModelClasses = [
  LocalInvoice,
  LocalInvoiceItem,
  LocalCustomer,
  LocalInventoryBatch,
  LocalSyncState,
];
