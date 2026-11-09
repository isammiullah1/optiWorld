'use client';

import {
  RetailerShellSchema,
  centsToMoney,
  moneyToCents,
  resolveDiscountCents,
  type CustomerSearchHit,
  type InventorySearchHit,
  type ItemPrescription,
  type SavedPrescription,
} from '@optiworld/shared';
import { z } from 'zod';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { readPosSnapshot, writePosMeta } from '@/lib/offline/pos-db';
import { recordCartSale, registerInvoiceSync, syncPos } from '@/lib/offline/sync-client';

import {
  BillCustomerSection,
  contactDigits,
  draftFromHit,
  EMPTY_BILL_CUSTOMER,
  matchingCustomer,
  type BillCustomerDraft,
} from './BillCustomerSection';
import {
  createCustomerRecord,
  loadCustomerPrescriptions,
  loadCustomerProfile,
  saveCustomerPrescription,
  updateCustomerPrescription,
  updateCustomerRecord,
} from './customers-api';
import { BillingPad } from './BillingPad';
import { hasFilledPrescription, linePrescription, needsPrescription } from './item-prescription';
import { LinePrescriptionDialog } from './LinePrescriptionDialog';
import type { CartLine } from './SaleCart';
import { loadRetailerSettings } from './inventory-api';
import { resolveBillLogoUrl } from './ShopMark';
import {
  createPosInvoice,
  loadConnectedLabs,
  searchPosCustomers,
  searchPosInventory,
} from './pos-api';

export function PosBilling(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCustomerId = searchParams.get('customer');
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<InventorySearchHit[]>([]);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [draft, setDraft] = useState<BillCustomerDraft>(EMPTY_BILL_CUSTOMER);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerSearchHit[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const [match, setMatch] = useState<CustomerSearchHit | null>(null);
  const [ignoredMatch, setIgnoredMatch] = useState<string | null>(null);
  const [customerPrompt, setCustomerPrompt] = useState<string | null>(null);
  const [customerIssues, setCustomerIssues] = useState<{
    name?: string;
    whatsapp?: string;
    gender?: string;
  }>({});
  const [pendingProduct, setPendingProduct] = useState<InventorySearchHit | null>(null);
  const [savedPrescriptions, setSavedPrescriptions] = useState<SavedPrescription[]>([]);
  const [rxLineId, setRxLineId] = useState<string | null>(null);
  const [labs, setLabs] = useState<Array<{ id: string; name: string }>>([]);
  const [billLabId, setBillLabId] = useState('');
  const [assignAllToLab, setAssignAllToLab] = useState(false);
  const [shopName, setShopName] = useState('');
  const [billHeading, setBillHeading] = useState('');
  const [billTagline, setBillTagline] = useState('');
  const [billTerms, setBillTerms] = useState('');
  const [billLogoUrl, setBillLogoUrl] = useState<string | null>(null);
  const [headerContact, setHeaderContact] = useState<string | null>(null);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [amountReceived, setAmountReceived] = useState('0');
  const [makeDelivery, setMakeDelivery] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryCharge, setDeliveryCharge] = useState('');
  const [discountMode, setDiscountMode] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [discountInput, setDiscountInput] = useState('');
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const onOnline = (): void => setOffline(false);
    const onOffline = (): void => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js');
    }
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!token || offline) {
      void readPosSnapshot().then((snapshot) => {
        setProducts(
          snapshot.batches
            .filter((batch) => matches(batch.productName, batch.priceCode, query))
            .map((batch) => ({
              id: batch.id,
              priceCode: batch.priceCode,
              productName: batch.productName,
              brand: null,
              category: batch.category,
              prescriptionRequired: batch.prescriptionRequired ?? null,
              salePrice: batch.salePrice,
              stockQty: batch.stockQty,
              lowStock: batch.stockQty <= batch.lowStockThreshold,
            })),
        );
        setCustomers(
          snapshot.customers
            .filter((entry) =>
              entry.name.toLowerCase().includes(customerQuery.trim().toLowerCase()),
            )
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              phone: entry.phone,
              whatsappNumber: null,
              gender: null,
              dateOfBirth: null,
              referredBy: null,
              creditLimit: entry.creditLimit,
              outstanding: '0.00',
              lastPurchaseAt: null,
            })),
        );
      });
      return;
    }
    const handle = window.setTimeout(() => {
      void searchPosInventory(token, query)
        .then(setProducts)
        .catch(() => setProducts([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [token, query, offline, customerQuery]);

  useEffect(() => {
    if (!token || offline || !menuOpen) {
      return;
    }
    const handle = window.setTimeout(() => {
      void searchPosCustomers(token, customerQuery)
        .then(setCustomers)
        .catch(() => setCustomers([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [token, customerQuery, menuOpen, offline]);

  useEffect(() => {
    if (!token || offline || !draft.id) {
      setSavedPrescriptions([]);
      return;
    }
    void loadCustomerPrescriptions(token, draft.id)
      .then(setSavedPrescriptions)
      .catch(() => setSavedPrescriptions([]));
  }, [token, offline, draft.id]);

  useEffect(() => {
    if (!token || !presetCustomerId) {
      return;
    }
    void loadCustomerProfile(token, presetCustomerId)
      .then((profile) => {
        setDraft({
          id: profile.id,
          name: profile.name,
          phone: profile.phone ?? '',
          whatsappNumber: profile.whatsappNumber ?? '',
          gender: profile.gender ?? '',
          dateOfBirth: profile.dateOfBirth ?? '',
          age: '',
          referredBy: profile.referredBy ?? '',
          creditLimit: profile.creditLimit,
          outstanding: profile.outstanding,
        });
        setCustomerQuery(profile.name);
      })
      .catch(() => undefined);
  }, [token, presetCustomerId]);

  useEffect(() => {
    if (!token || offline) {
      return;
    }
    void syncPos(token).catch(() => undefined);
    void loadConnectedLabs(token)
      .then(setLabs)
      .catch(() => setLabs([]));
    void loadRetailerSettings(token)
      .then((settings) => {
        const contact = [settings.phone, settings.address, settings.city]
          .map((part) => part?.trim() ?? '')
          .filter((part) => part.length > 0)
          .join(' · ');
        setShopName(settings.businessName);
        setBillHeading(settings.billHeading);
        setBillTagline(settings.billTagline);
        setBillTerms(settings.billTerms);
        setBillLogoUrl(resolveBillLogoUrl(settings.billLogoUrl));
        setHeaderContact(contact.length > 0 ? contact : null);
        void writePosMeta(
          'billPad',
          JSON.stringify({
            heading: settings.billHeading,
            tagline: settings.billTagline,
            terms: settings.billTerms,
            logoUrl: resolveBillLogoUrl(settings.billLogoUrl),
            phone: settings.phone,
            address: [settings.address, settings.city]
              .filter((part) => part && part.length > 0)
              .join(', '),
            shopName: settings.businessName,
          }),
        );
      })
      .catch(() => undefined);
    void fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/retailer/shell`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    )
      .then((response) => response.json())
      .then((payload: unknown) => {
        const parsed = z
          .object({ success: z.literal(true), data: RetailerShellSchema })
          .safeParse(payload);
        if (parsed.success) {
          void writePosMeta('orgName', parsed.data.data.orgName);
        }
      })
      .catch(() => undefined);
  }, [token, offline]);

  const deliverNow = makeDelivery;
  const totals = useMemo(
    () => priceCart(lines, discountMode, discountInput, deliverNow ? deliveryCharge : ''),
    [lines, discountMode, discountInput, deliverNow, deliveryCharge],
  );

  function addProduct(product: InventorySearchHit): void {
    if (!draft.id && draft.name.trim().length === 0) {
      setPendingProduct(product);
      setCustomerPrompt('Choose a saved customer, or type a new name.');
      setCustomerQuery('');
      setMenuOpen(true);
      setFocusTick((current) => current + 1);
      return;
    }
    setQuery('');
    insertProduct(product);
  }

  function insertProduct(product: InventorySearchHit): void {
    const existing = lines.some((line) => line.inventoryBatchId === product.id);
    if (
      !existing &&
      needsPrescription(product.category, product.productName, product.prescriptionRequired)
    ) {
      setRxLineId(product.id);
    }
    setLines((current) => {
      const found = current.find((line) => line.inventoryBatchId === product.id);
      if (found) {
        return current.map((line) =>
          line.inventoryBatchId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          inventoryBatchId: product.id,
          priceCode: product.priceCode,
          productName: product.productName,
          category: product.category,
          prescriptionRequired: product.prescriptionRequired ?? null,
          unitPrice: product.salePrice,
          quantity: 1,
          prescription: null,
        },
      ];
    });
  }

  function applyCustomer(next: CustomerSearchHit): void {
    setDraft(draftFromHit(next));
    setCustomerQuery(next.name);
    setMenuOpen(false);
    setMatch(null);
    setIgnoredMatch(null);
    setCustomerPrompt(null);
    if (!pendingProduct) {
      return;
    }
    const product = pendingProduct;
    setPendingProduct(null);
    setQuery('');
    insertProduct(product);
  }

  async function lookupMatch(number: string): Promise<CustomerSearchHit | null> {
    if (contactDigits(number).length < 10) {
      return null;
    }
    if (!token || offline) {
      const snapshot = await readPosSnapshot();
      return matchingCustomer(
        snapshot.customers.map((entry) => ({
          id: entry.id,
          name: entry.name,
          phone: entry.phone,
          whatsappNumber: null,
          gender: null,
          dateOfBirth: null,
          referredBy: null,
          creditLimit: entry.creditLimit,
          outstanding: '0.00',
          lastPurchaseAt: null,
        })),
        number,
      );
    }
    const hits = await searchPosCustomers(token, number).catch(() => []);
    return matchingCustomer(hits, number);
  }

  function considerMatch(number: string, linkedId: string | null = draft.id): void {
    void lookupMatch(number).then((found) => {
      if (
        !found ||
        linkedId === found.id ||
        ignoredMatch === `${found.id}:${contactDigits(number)}`
      ) {
        return;
      }
      setMatch(found);
    });
  }

  function attachLinePrescription(
    id: string,
    value: SavedPrescription | ItemPrescription,
    labOrgId: string,
  ): void {
    const savedId = 'source' in value ? value.id : undefined;
    const chosenLab = labOrgId.length > 0 ? labOrgId : undefined;
    if (savedId || !draft.id || !token || offline) {
      setLines((current) =>
        current.map((line) =>
          line.inventoryBatchId === id
            ? { ...line, prescription: linePrescription(value, savedId, chosenLab) }
            : line,
        ),
      );
      setRxLineId(null);
      return;
    }
    void saveCustomerPrescription(token, draft.id, value)
      .then((created) => {
        setSavedPrescriptions((current) => [
          created,
          ...current.filter((entry) => entry.id !== created.id),
        ]);
        setLines((current) =>
          current.map((line) =>
            line.inventoryBatchId === id
              ? { ...line, prescription: linePrescription(created, created.id, chosenLab) }
              : line,
          ),
        );
        setRxLineId(null);
      })
      .catch((reason: unknown) => {
        setLines((current) =>
          current.map((line) =>
            line.inventoryBatchId === id
              ? { ...line, prescription: linePrescription(value, undefined, chosenLab) }
              : line,
          ),
        );
        setRxLineId(null);
        setError(reason instanceof Error ? reason.message : 'The prescription could not be saved.');
      });
  }

  const rxLine = lines.find((line) => line.inventoryBatchId === rxLineId) ?? null;

  async function resolveCustomerId(): Promise<string> {
    if (match) {
      throw new Error('Confirm the customer already on file, or edit this as a new customer.');
    }
    if (draft.id) {
      if (token && !offline) {
        await updateCustomerRecord(token, draft.id, {
          ...(draft.gender ? { gender: draft.gender } : {}),
          dateOfBirth: draft.dateOfBirth,
          referredBy: draft.referredBy,
          whatsappNumber: draft.whatsappNumber,
        });
      }
      return draft.id;
    }
    const found = (await lookupMatch(draft.phone)) ?? (await lookupMatch(draft.whatsappNumber));
    if (
      found &&
      ignoredMatch !== `${found.id}:${contactDigits(draft.phone || draft.whatsappNumber)}`
    ) {
      setMatch(found);
      throw new Error('This contact is already on file.');
    }
    const phone = draft.phone.trim();
    if (draft.name.trim().length === 0 || draft.whatsappNumber.trim().length === 0) {
      throw new Error('Enter the customer name and WhatsApp number.');
    }
    if (!token || offline) {
      throw new Error('Connect to the internet to add a customer.');
    }
    const created = await createCustomerRecord(token, {
      name: draft.name.trim(),
      ...(phone ? { phone } : {}),
      whatsappNumber: draft.whatsappNumber,
      ...(draft.gender ? { gender: draft.gender } : {}),
      ...(draft.dateOfBirth ? { dateOfBirth: draft.dateOfBirth } : {}),
      referredBy: draft.referredBy,
      creditLimit: draft.creditLimit || '0.00',
    });
    setDraft((current) => ({
      ...current,
      id: created.id,
      outstanding: created.outstanding,
      creditLimit: created.creditLimit,
    }));
    return created.id;
  }

  async function complete(): Promise<void> {
    if (lines.length === 0) {
      return;
    }
    const nextIssues: { name?: string; whatsapp?: string; gender?: string } = {};
    if (draft.name.trim().length === 0) {
      nextIssues.name = 'Enter the customer name.';
    }
    if (draft.whatsappNumber.trim().length === 0) {
      nextIssues.whatsapp = 'Enter the WhatsApp number.';
    }
    if (!draft.gender) {
      nextIssues.gender = 'Choose the customer gender.';
    }
    if (nextIssues.name || nextIssues.whatsapp || nextIssues.gender) {
      setCustomerIssues(nextIssues);
      setError(null);
      return;
    }
    setCustomerIssues({});
    const labLines = lines.filter((line) =>
      needsPrescription(line.category, line.productName, line.prescriptionRequired),
    );
    const sendToLab =
      assignAllToLab &&
      billLabId.length > 0 &&
      labLines.length > 0 &&
      labLines.every((line) => hasFilledPrescription(line.prescription));
    if (labLines.length === 0 && assignAllToLab) {
      setAssignAllToLab(false);
      setBillLabId('');
    } else if (assignAllToLab && !sendToLab) {
      const missing = labLines.find((line) => !hasFilledPrescription(line.prescription));
      if (missing) {
        setRxLineId(missing.inventoryBatchId);
        setError(
          `Add a prescription for ${missing.productName} before sending this bill to a lab.`,
        );
      } else {
        setError('Choose a laboratory for this bill, or leave the lab tick unmarked.');
      }
      return;
    }
    const address = deliveryAddress.trim();
    const chargeText = deliveryCharge.trim();
    if (deliverNow && !address) {
      setError('Enter the delivery address.');
      return;
    }
    if (deliverNow && !/^\d{1,10}(\.\d{1,2})?$/.test(chargeText)) {
      setError('Enter the delivery charges.');
      return;
    }
    const deliveryFields = deliverNow
      ? { deliveryAddress: address, deliveryCharge: centsToMoney(moneyToCents(chargeText)) }
      : {};
    const totalCents = moneyToCents(totals.total);
    const receivedText = amountReceived.trim();
    const receivedCents = /^\d{1,10}(\.\d{1,2})?$/.test(receivedText)
      ? moneyToCents(receivedText)
      : null;
    if (paymentType === 'CREDIT' && (receivedCents === null || receivedCents > totalCents)) {
      setError('Enter an amount from zero up to the bill total.');
      return;
    }
    const settledCents =
      paymentType === 'CREDIT' && receivedCents !== null ? receivedCents : totalCents;
    setBusy(true);
    setError(null);
    try {
      const customerId = await resolveCustomerId();
      const localId = crypto.randomUUID();
      const payload = {
        localId,
        customerId,
        paymentType,
        ...(paymentType === 'CREDIT' ? { amountReceived: centsToMoney(settledCents) } : {}),
        discount: totals.discount,
        items: lines.map((line) => ({
          inventoryBatchId: line.inventoryBatchId,
          quantity: line.quantity,
          unitPrice: normalizePrice(line.unitPrice),
          ...(line.prescription ? { prescription: line.prescription } : {}),
        })),
        ...(sendToLab ? { assignAllToLab: true, billLabOrgId: billLabId } : {}),
        ...deliveryFields,
      };
      if (!offline && token) {
        const receipt = await createPosInvoice(token, payload);
        router.push(`/retailer/billing/${receipt.id}/receipt`);
        return;
      }
      await recordCartSale({
        customerId,
        items: payload.items,
        discount: totals.discount,
        status: paymentType === 'CREDIT' && settledCents < totalCents ? 'CREDIT' : 'PAID',
        paymentType,
        ...(paymentType === 'CREDIT' ? { amountReceived: centsToMoney(settledCents) } : {}),
        localId,
        ...(sendToLab ? { assignAllToLab: true, billLabOrgId: billLabId } : {}),
        ...deliveryFields,
      });
      await registerInvoiceSync();
      router.push(`/retailer/billing/local/${localId}/receipt`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'The sale could not be completed.';
      if (message === 'Enter the customer name and WhatsApp number.') {
        setCustomerIssues({
          ...(draft.name.trim().length === 0 ? { name: 'Enter the customer name.' } : {}),
          ...(draft.whatsappNumber.trim().length === 0
            ? { whatsapp: 'Enter the WhatsApp number.' }
            : {}),
        });
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error ? (
        <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {customerPrompt && !menuOpen ? (
        <p className="rounded-lg bg-amber-soft px-3 py-2 text-sm text-amber" role="status">
          {customerPrompt}
        </p>
      ) : null}
      <BillingPad
        shopName={shopName}
        billHeading={billHeading}
        billTagline={billTagline}
        billTerms={billTerms}
        billLogoUrl={billLogoUrl}
        headerContact={headerContact}
        canComplete={
          (paymentType !== 'CREDIT' ||
            (/^\d{1,10}(\.\d{1,2})?$/.test(amountReceived.trim()) &&
              moneyToCents(amountReceived.trim()) <= moneyToCents(totals.total))) &&
          (!deliverNow ||
            (deliveryAddress.trim().length > 0 &&
              /^\d{1,10}(\.\d{1,2})?$/.test(deliveryCharge.trim())))
        }
        customer={
          <BillCustomerSection
            draft={draft}
            suggestions={customers}
            menuOpen={menuOpen}
            focusTick={focusTick}
            match={match}
            nameError={customerIssues.name}
            whatsappError={customerIssues.whatsapp}
            genderError={customerIssues.gender}
            onName={(value) => {
              if (value.trim().length > 0) {
                setCustomerIssues((current) => ({ ...current, name: undefined }));
              }
              setCustomerQuery(value);
              setMenuOpen(true);
              setDraft((current) => {
                if (current.id && value !== current.name) {
                  considerMatch(current.phone || current.whatsappNumber, null);
                  return { ...current, name: value, id: null, outstanding: null };
                }
                return { ...current, name: value };
              });
            }}
            onPhone={(value) => {
              setMatch(null);
              setDraft((current) =>
                current.phone === value
                  ? current
                  : { ...current, phone: value, id: null, outstanding: null },
              );
            }}
            onWhatsapp={(value) => {
              if (value.trim().length > 0) {
                setCustomerIssues((current) => ({ ...current, whatsapp: undefined }));
              }
              setDraft((current) => ({ ...current, whatsappNumber: value }));
            }}
            onGender={(gender) => {
              if (gender) {
                setCustomerIssues((current) => ({ ...current, gender: undefined }));
              }
              setDraft((current) => ({ ...current, gender }));
            }}
            onDateOfBirth={(dateOfBirth) => setDraft((current) => ({ ...current, dateOfBirth }))}
            onAge={(age) => setDraft((current) => ({ ...current, age }))}
            onMenu={(open) => {
              setMenuOpen(open);
              if (open) {
                setCustomerQuery(draft.name);
              }
            }}
            onPick={applyCustomer}
            onPhoneBlur={() => {
              if (!draft.id) {
                considerMatch(draft.phone);
              }
            }}
            onWhatsappBlur={() => {
              if (!draft.id) {
                considerMatch(draft.whatsappNumber);
              }
            }}
            onUseMatch={() => {
              if (match) {
                applyCustomer(match);
              }
            }}
            onEditMatch={() => {
              if (!match) {
                return;
              }
              setIgnoredMatch(`${match.id}:${contactDigits(draft.phone || draft.whatsappNumber)}`);
              setMatch(null);
              setDraft((current) => ({ ...current, id: null, outstanding: null }));
              setFocusTick((current) => current + 1);
            }}
          />
        }
        lines={lines}
        labs={labs}
        query={query}
        products={products}
        discountMode={discountMode}
        discountInput={discountInput}
        subtotal={totals.subtotal}
        discount={totals.discount}
        total={totals.total}
        paymentType={paymentType}
        amountReceived={amountReceived}
        makeDelivery={makeDelivery}
        deliveryAddress={deliveryAddress}
        deliveryCharge={deliveryCharge}
        assignAllToLab={assignAllToLab}
        billLabId={billLabId}
        busy={busy}
        prescriptionLineId={rxLine?.inventoryBatchId ?? null}
        prescriptionPanel={
          rxLine ? (
            <LinePrescriptionDialog
              key={rxLine.inventoryBatchId}
              productName={rxLine.productName}
              customerName={draft.name.trim() || null}
              saved={savedPrescriptions}
              billLines={lines.flatMap((line) => {
                if (
                  line.inventoryBatchId === rxLine.inventoryBatchId ||
                  !line.prescription ||
                  !hasFilledPrescription(line.prescription)
                ) {
                  return [];
                }
                return [
                  {
                    lineId: line.inventoryBatchId,
                    productName: line.productName,
                    savedId: line.prescription.savedId,
                    labOrgId: line.prescription.labOrgId ?? '',
                    prescription: line.prescription,
                  },
                ];
              })}
              labs={labs}
              initialLabId={rxLine.prescription?.labOrgId ?? ''}
              initialPrescription={rxLine.prescription ?? null}
              onClose={() => setRxLineId(null)}
              onSkip={() => {
                setLines((current) =>
                  current.map((line) =>
                    line.inventoryBatchId === rxLine.inventoryBatchId
                      ? { ...line, prescription: null }
                      : line,
                  ),
                );
                setRxLineId(null);
              }}
              onUse={(record, labOrgId) =>
                attachLinePrescription(rxLine.inventoryBatchId, record, labOrgId)
              }
              onSaveNew={(value, labOrgId) =>
                attachLinePrescription(rxLine.inventoryBatchId, value, labOrgId)
              }
              onUpdate={async (record, value, labOrgId) => {
                if (!token || !draft.id || offline) {
                  throw new Error('Connect to the internet to update a saved prescription.');
                }
                const updated = await updateCustomerPrescription(token, draft.id, record.id, value);
                setSavedPrescriptions((current) =>
                  current.map((entry) =>
                    entry.id === updated.id && entry.source === 'SAVED' ? updated : entry,
                  ),
                );
                attachLinePrescription(rxLine.inventoryBatchId, updated, labOrgId);
              }}
            />
          ) : null
        }
        onQuery={setQuery}
        onAdd={addProduct}
        onQuantity={(id, quantity) =>
          setLines((current) =>
            current.map((line) =>
              line.inventoryBatchId === id
                ? { ...line, quantity: Math.max(1, Math.min(quantity, 10_000)) }
                : line,
            ),
          )
        }
        onPrice={(id, unitPrice) =>
          setLines((current) =>
            current.map((line) => (line.inventoryBatchId === id ? { ...line, unitPrice } : line)),
          )
        }
        onRemove={(id) => {
          setLines((current) => current.filter((line) => line.inventoryBatchId !== id));
          setRxLineId((current) => (current === id ? null : current));
        }}
        onLinePrescription={setRxLineId}
        onDiscountMode={setDiscountMode}
        onDiscountInput={setDiscountInput}
        onPayment={setPaymentType}
        onAmountReceived={setAmountReceived}
        onMakeDelivery={setMakeDelivery}
        onDeliveryAddress={setDeliveryAddress}
        onDeliveryCharge={setDeliveryCharge}
        onAssignAll={(next) => {
          const labLines = lines.filter((line) =>
            needsPrescription(line.category, line.productName, line.prescriptionRequired),
          );
          if (labLines.length === 0) {
            setAssignAllToLab(false);
            setBillLabId('');
            return;
          }
          if (!next) {
            setAssignAllToLab(false);
            return;
          }
          const missing = labLines.find((line) => !hasFilledPrescription(line.prescription));
          if (missing) {
            setAssignAllToLab(false);
            setRxLineId(missing.inventoryBatchId);
            setError(
              `Add a prescription for ${missing.productName} before sending this bill to a lab.`,
            );
            return;
          }
          setError(null);
          setAssignAllToLab(true);
        }}
        onBillLab={setBillLabId}
        onComplete={() => {
          void complete();
        }}
      />
    </div>
  );
}

function priceCart(
  lines: readonly CartLine[],
  mode: 'AMOUNT' | 'PERCENT',
  input: string,
  deliveryCharge: string,
): { subtotal: string; discount: string; total: string } {
  const subtotal = lines.reduce(
    (sum, line) => sum + moneyToCents(normalizePrice(line.unitPrice)) * line.quantity,
    0,
  );
  const discount = resolveDiscountCents(subtotal, mode, input);
  const charge = /^\d{1,10}(\.\d{1,2})?$/.test(deliveryCharge.trim())
    ? moneyToCents(deliveryCharge.trim())
    : 0;
  return {
    subtotal: centsToMoney(subtotal),
    discount: centsToMoney(discount),
    total: centsToMoney(subtotal - discount + charge),
  };
}

function normalizePrice(value: string): string {
  return /^\d{1,10}(\.\d{1,2})?$/.test(value) ? value : '0.00';
}

function matches(name: string, code: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return name.toLowerCase().includes(q) || code.toLowerCase().includes(q);
}
