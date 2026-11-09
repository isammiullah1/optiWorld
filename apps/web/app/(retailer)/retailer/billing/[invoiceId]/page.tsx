import { InvoiceDetail } from '@/components/retailer/InvoiceDetail';

export default function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: { invoiceId: string };
  searchParams: { edit?: string | string[] };
}): React.ReactElement {
  const edit = searchParams.edit;
  const editCredit = edit === 'credit' || (Array.isArray(edit) && edit.includes('credit'));
  const editLab = edit === 'lab' || (Array.isArray(edit) && edit.includes('lab'));
  return <InvoiceDetail invoiceId={params.invoiceId} editCredit={editCredit} editLab={editLab} />;
}
