import { SetupFrame } from '@/components/onboarding/setup-frame';

export default function SetupLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <SetupFrame>{children}</SetupFrame>;
}
