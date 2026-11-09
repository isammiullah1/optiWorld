export function RetailerSection({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.ReactElement {
  return (
    <section className="rounded-xl border border-line bg-white p-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink2">{description}</p>
    </section>
  );
}
