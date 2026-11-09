'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateInventorySchema,
  UpdateInventorySchema,
  categoryRequiresPrescription,
  combinePriceCode,
  findInventoryCategory,
  type CreateInventoryRequest,
  type InventoryBatchRecord,
  type InventoryCategoryRule,
  type UpdateInventoryRequest,
} from '@optiworld/shared';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { CategoryField } from './CategoryField';

const InventoryFormSchema = z
  .object({
    prefix: z.string().trim().min(1, 'Enter a prefix').max(12),
    pricePart: z.string().trim().max(24),
    priceCode: z.string().trim().max(40),
    manualPriceCode: z.boolean(),
    productName: z.string().trim().min(1, 'Enter a product name').max(160),
    brand: z.string().trim().max(80),
    category: z.string().trim().min(1, 'Enter a category').max(40),
    prescriptionRequired: z.boolean(),
    salePrice: z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a sale price'),
    costPrice: z.string(),
    stockQty: z.string().regex(/^\d+$/, 'Enter the opening quantity'),
    lowStockThreshold: z.string().regex(/^\d+$/, 'Enter a threshold'),
  })
  .superRefine((value, ctx) => {
    if (value.manualPriceCode && value.priceCode.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['priceCode'], message: 'Enter a product code' });
    }
    if (!value.manualPriceCode && value.pricePart.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['pricePart'],
        message: 'Enter the price part of the code',
      });
    }
    if (value.costPrice.length > 0 && !/^\d{1,10}(\.\d{1,2})?$/.test(value.costPrice)) {
      ctx.addIssue({ code: 'custom', path: ['costPrice'], message: 'Enter a cost price' });
    }
  });

type InventoryFormValues = z.infer<typeof InventoryFormSchema>;

export function InventoryDrawer({
  open,
  batch,
  showCost,
  defaultThreshold,
  saving,
  error,
  categoryRules,
  onClose,
  onCreate,
  onUpdate,
}: {
  open: boolean;
  batch: InventoryBatchRecord | null;
  showCost: boolean;
  defaultThreshold: number;
  saving: boolean;
  error: string | null;
  categoryRules: readonly InventoryCategoryRule[];
  onClose: () => void;
  onCreate: (input: CreateInventoryRequest) => Promise<void>;
  onUpdate: (batchId: string, input: UpdateInventoryRequest) => Promise<void>;
}): React.ReactElement | null {
  if (!open) {
    return null;
  }
  return (
    <InventoryDrawerForm
      key={batch?.id ?? 'new'}
      batch={batch}
      showCost={showCost}
      defaultThreshold={defaultThreshold}
      saving={saving}
      error={error}
      categoryRules={categoryRules}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
    />
  );
}

function InventoryDrawerForm({
  batch,
  showCost,
  defaultThreshold,
  saving,
  error,
  categoryRules,
  onClose,
  onCreate,
  onUpdate,
}: {
  batch: InventoryBatchRecord | null;
  showCost: boolean;
  defaultThreshold: number;
  saving: boolean;
  error: string | null;
  categoryRules: readonly InventoryCategoryRule[];
  onClose: () => void;
  onCreate: (input: CreateInventoryRequest) => Promise<void>;
  onUpdate: (batchId: string, input: UpdateInventoryRequest) => Promise<void>;
}): React.ReactElement {
  const form = useForm<InventoryFormValues>({
    resolver: zodResolver(InventoryFormSchema),
    defaultValues: batch ? valuesFromBatch(batch) : emptyValues(defaultThreshold),
  });
  const prefix = form.watch('prefix');
  const pricePart = form.watch('pricePart');
  const manual = form.watch('manualPriceCode');
  const combined = combinePriceCode(prefix, pricePart);

  const category = form.watch('category');
  const prescriptionRequired = form.watch('prescriptionRequired');
  const locked = batch !== null;
  const fieldClass = locked ? `${inputClass} bg-canvas text-ink2` : inputClass;
  const lockProps = locked ? ({ readOnly: true, tabIndex: -1 } as const) : {};

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-end overflow-hidden bg-ink/40 sm:items-stretch"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-drawer-title"
        className="grid max-h-[92vh] w-full min-w-0 max-w-full gap-3 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-t-xl border-2 border-action bg-white p-4 ring-4 ring-action-soft sm:h-full sm:max-h-none sm:w-[28rem] sm:max-w-[28rem] sm:rounded-none"
        onSubmit={form.handleSubmit(async (values) => {
          const chosen = values.category.trim();
          const known = findInventoryCategory(chosen);
          const saved = categoryRules.find(
            (rule) =>
              findInventoryCategory(rule.name) === null &&
              rule.name.toLowerCase() === chosen.toLowerCase(),
          );
          const shared = {
            prefix: values.prefix,
            pricePart: values.pricePart,
            priceCode: values.manualPriceCode ? values.priceCode : combined,
            manualPriceCode: values.manualPriceCode,
            productName: values.productName,
            brand: values.brand,
            category: known?.name ?? saved?.name ?? chosen,
            prescriptionRequired: known ? known.prescriptionRequired : values.prescriptionRequired,
            salePrice: values.salePrice,
            lowStockThreshold: Number(values.lowStockThreshold),
            ...(showCost && values.costPrice ? { costPrice: values.costPrice } : {}),
          };
          if (batch) {
            await onUpdate(batch.id, UpdateInventorySchema.parse(shared));
            return;
          }
          await onCreate(
            CreateInventorySchema.parse({ ...shared, stockQty: Number(values.stockQty) }),
          );
        })}
      >
        <div className="flex items-center justify-between">
          <h2 id="inventory-drawer-title" className="text-lg font-semibold text-ink">
            {batch ? 'Adjust price' : 'Add batch'}
          </h2>
          <button type="button" className="min-h-[44px] px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        {locked ? (
          <p className="text-sm text-ink2">
            Only the sale price and the low stock threshold can change. The change is recorded in
            stock movement.
          </p>
        ) : null}
        <div className="grid min-w-0 grid-cols-2 gap-3">
          <Field label="Prefix" error={form.formState.errors.prefix?.message}>
            <input className={fieldClass} {...lockProps} {...form.register('prefix')} />
          </Field>
          <Field label="Suffix code" error={form.formState.errors.pricePart?.message}>
            <input
              className={fieldClass}
              inputMode="numeric"
              {...lockProps}
              {...form.register('pricePart')}
            />
          </Field>
        </div>
        <p className="text-sm text-ink2">
          Product code:{' '}
          <span className="font-semibold text-action">
            {manual ? form.watch('priceCode') || '—' : combined || '—'}
          </span>
        </p>
        <label className="flex min-h-[44px] items-center gap-2 text-sm text-ink2">
          <input
            type="checkbox"
            className={locked ? 'pointer-events-none' : undefined}
            {...form.register('manualPriceCode')}
          />
          Set the product code manually
        </label>
        {manual ? (
          <Field label="Product code" error={form.formState.errors.priceCode?.message}>
            <input className={fieldClass} {...lockProps} {...form.register('priceCode')} />
          </Field>
        ) : null}
        <Field label="Product name" error={form.formState.errors.productName?.message}>
          <input className={fieldClass} {...lockProps} {...form.register('productName')} />
        </Field>
        <Field label="Brand" error={form.formState.errors.brand?.message}>
          <input className={fieldClass} {...lockProps} {...form.register('brand')} />
        </Field>
        <CategoryField
          value={category}
          prescriptionRequired={prescriptionRequired}
          rules={categoryRules}
          error={form.formState.errors.category?.message}
          disabled={locked}
          onChange={(name) => form.setValue('category', name, { shouldValidate: true })}
          onPick={(name, required) => {
            form.setValue('category', name, { shouldValidate: true });
            form.setValue('prescriptionRequired', required);
          }}
          onPrescription={(required) => form.setValue('prescriptionRequired', required)}
        />
        {showCost ? (
          <Field
            label="Cost price (₨)"
            error={locked ? undefined : form.formState.errors.costPrice?.message}
          >
            <input
              className={fieldClass}
              inputMode="decimal"
              {...lockProps}
              {...form.register('costPrice')}
            />
          </Field>
        ) : null}
        <Field label="Sale price (₨)" error={form.formState.errors.salePrice?.message}>
          <input className={inputClass} inputMode="decimal" {...form.register('salePrice')} />
        </Field>
        {batch ? (
          <p className="text-sm text-ink2">
            Stock on hand is {batch.stockQty}. Use Adjust stock on the batch to change it.
          </p>
        ) : (
          <Field label="Initial stock qty" error={form.formState.errors.stockQty?.message}>
            <input className={inputClass} inputMode="numeric" {...form.register('stockQty')} />
          </Field>
        )}
        <Field label="Low stock threshold" error={form.formState.errors.lowStockThreshold?.message}>
          <input
            className={inputClass}
            inputMode="numeric"
            {...form.register('lowStockThreshold')}
          />
        </Field>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={form.formState.isSubmitting || saving}
          className="min-h-[44px] rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
        >
          {batch ? 'Save price' : 'Add batch'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <label className="grid min-w-0 gap-1 text-sm text-ink2">
      {label}
      {children}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}

function emptyValues(threshold: number): InventoryFormValues {
  return {
    prefix: '',
    pricePart: '',
    priceCode: '',
    manualPriceCode: false,
    productName: '',
    brand: '',
    category: '',
    prescriptionRequired: false,
    salePrice: '',
    costPrice: '',
    stockQty: '0',
    lowStockThreshold: String(threshold),
  };
}

function valuesFromBatch(batch: InventoryBatchRecord): InventoryFormValues {
  const prefix = batch.prefix;
  const auto = batch.priceCode.toUpperCase().startsWith(prefix.toUpperCase());
  const pricePart = auto ? batch.priceCode.slice(prefix.length) : '';
  return {
    prefix,
    pricePart,
    priceCode: batch.priceCode,
    manualPriceCode: !auto || pricePart.length === 0,
    productName: batch.productName,
    brand: batch.brand ?? '',
    category: findInventoryCategory(batch.category)?.name ?? batch.category,
    prescriptionRequired:
      batch.prescriptionRequired ??
      categoryRequiresPrescription(batch.category, batch.productName, null),
    salePrice: batch.salePrice,
    costPrice: batch.costPrice ?? '',
    stockQty: String(batch.stockQty),
    lowStockThreshold: String(batch.lowStockThreshold),
  };
}

const inputClass =
  'min-h-[44px] w-full min-w-0 max-w-full rounded-lg border border-line px-3 text-base text-ink outline-none focus:border-action';
