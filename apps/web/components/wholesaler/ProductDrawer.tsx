'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { WholesalerCatalogItem } from '@optiworld/shared';
import { SaveCatalogProductSchema } from '@optiworld/shared';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { removeProduct, saveCategory, saveProduct } from './wholesaler-api';

const CUSTOM = '__custom__';

const DrawerFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a product name').max(120),
    category: z.string().min(1, 'Choose a category'),
    customCategory: z.string().trim().max(80),
    description: z.string().trim().max(2000),
    listedPrice: z.string().trim(),
    isPriceOnRequest: z.boolean(),
    availabilityStatus: z.enum(['AVAILABLE', 'OUT_OF_STOCK']),
    productCode: z.string().trim().max(40),
  })
  .superRefine((input, context) => {
    const category = input.category === CUSTOM ? input.customCategory : input.category;
    if (category.trim().length === 0) {
      context.addIssue({ code: 'custom', message: 'Enter a category', path: ['customCategory'] });
    }
    if (!input.isPriceOnRequest && !/^\d{1,10}(\.\d{1,2})?$/.test(input.listedPrice)) {
      context.addIssue({ code: 'custom', message: 'Enter a listed price', path: ['listedPrice'] });
    }
  });

type DrawerForm = z.infer<typeof DrawerFormSchema>;

type ProductDrawerProps = {
  open: boolean;
  product: WholesalerCatalogItem | null;
  categories: readonly string[];
  onClose: () => void;
  onSaved: () => void;
  onCategoryAdded: (name: string) => void;
};

export function ProductDrawer({
  open,
  product,
  categories,
  onClose,
  onSaved,
  onCategoryAdded,
}: ProductDrawerProps): React.ReactElement | null {
  const { data: session } = useSession();
  const [formError, setFormError] = useState('');
  const known = product && categories.includes(product.category);
  const form = useForm<DrawerForm>({
    resolver: zodResolver(DrawerFormSchema),
    defaultValues: valuesFor(
      product,
      known ? product.category : product ? CUSTOM : (categories[0] ?? CUSTOM),
    ),
  });
  const onRequest = form.watch('isPriceOnRequest');
  const category = form.watch('category');

  useEffect(() => {
    if (!open) {
      return;
    }
    const selected =
      product && categories.includes(product.category)
        ? product.category
        : product
          ? CUSTOM
          : (categories[0] ?? CUSTOM);
    form.reset(valuesFor(product, selected));
    setFormError('');
  }, [categories, form, open, product]);

  if (!open) {
    return null;
  }

  async function submit(values: DrawerForm): Promise<void> {
    const token = session?.accessToken;
    if (!token) {
      return;
    }
    const categoryName =
      values.category === CUSTOM ? values.customCategory.trim() : values.category;
    const parsed = SaveCatalogProductSchema.safeParse({
      name: values.name,
      category: categoryName,
      description: values.description,
      listedPrice: values.isPriceOnRequest ? null : values.listedPrice,
      isPriceOnRequest: values.isPriceOnRequest,
      availabilityStatus: values.availabilityStatus,
      productCode: values.productCode,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Check the product details');
      return;
    }
    setFormError('');
    try {
      if (values.category === CUSTOM) {
        const name = await saveCategory(token, categoryName);
        onCategoryAdded(name);
      }
      await saveProduct(token, parsed.data, product?.id);
      onSaved();
      onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not save this product');
    }
  }

  async function remove(): Promise<void> {
    const token = session?.accessToken;
    if (!token || !product) {
      return;
    }
    setFormError('');
    try {
      await removeProduct(token, product.id);
      onSaved();
      onClose();
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Could not remove this product');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-end bg-ink/40 sm:items-stretch">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close product editor"
        onClick={onClose}
      />
      <form
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-xl border border-line bg-white sm:h-full sm:max-h-none sm:w-[420px] sm:rounded-none"
        onSubmit={form.handleSubmit((values) => void submit(values))}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-lg font-semibold text-ink">
            {product ? 'Edit product' : 'Add product'}
          </h2>
          <button type="button" className="min-h-11 px-2 text-sm text-ink2" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <Field label="Name" error={form.formState.errors.name?.message}>
            <input className={inputClass} {...form.register('name')} />
          </Field>
          <Field label="Category" error={form.formState.errors.category?.message}>
            <select className={inputClass} {...form.register('category')}>
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
              <option value={CUSTOM}>Add custom</option>
            </select>
          </Field>
          {category === CUSTOM ? (
            <Field label="Custom category" error={form.formState.errors.customCategory?.message}>
              <input className={inputClass} {...form.register('customCategory')} />
            </Field>
          ) : null}
          <Field label="Description / specs" error={form.formState.errors.description?.message}>
            <textarea className={`${inputClass} min-h-24`} {...form.register('description')} />
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
            <input type="checkbox" {...form.register('isPriceOnRequest')} />
            Price on request
          </label>
          {onRequest ? null : (
            <Field label="Listed price (₨)" error={form.formState.errors.listedPrice?.message}>
              <input className={inputClass} inputMode="decimal" {...form.register('listedPrice')} />
            </Field>
          )}
          <fieldset>
            <legend className="mb-1 text-xs font-medium text-ink2">Availability</legend>
            <div className="flex gap-2">
              {(['AVAILABLE', 'OUT_OF_STOCK'] as const).map((status) => (
                <label
                  key={status}
                  className="flex min-h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm"
                >
                  <input type="radio" value={status} {...form.register('availabilityStatus')} />
                  {status === 'AVAILABLE' ? 'Available' : 'Out of stock'}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Product code" error={form.formState.errors.productCode?.message}>
            <input className={inputClass} {...form.register('productCode')} />
          </Field>
          {formError ? (
            <p className="text-sm text-danger" role="alert">
              {formError}
            </p>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
          {product ? (
            <button
              type="button"
              className="min-h-11 rounded-lg px-3 text-sm text-danger"
              onClick={() => void remove()}
            >
              Remove
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            className="min-h-11 rounded-lg bg-action px-4 text-sm font-medium text-white disabled:opacity-60"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Saving' : 'Save product'}
          </button>
        </div>
      </form>
    </div>
  );
}

function valuesFor(product: WholesalerCatalogItem | null, category: string): DrawerForm {
  return {
    name: product?.name ?? '',
    category,
    customCategory: category === CUSTOM ? (product?.category ?? '') : '',
    description: product?.description ?? '',
    listedPrice: product?.listedPrice ?? '',
    isPriceOnRequest: product?.isPriceOnRequest ?? false,
    availabilityStatus: product?.availabilityStatus ?? 'AVAILABLE',
    productCode: product?.productCode ?? '',
  };
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
    <label className="block text-sm text-ink">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-action focus:outline-none';
