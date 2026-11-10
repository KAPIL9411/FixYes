import { PartnerEarnings } from '../../features/partner/PartnerEarnings';
import { PartnerLanding } from '../../features/partner/PartnerLanding';
import { useWorkMode } from '../../work-mode';

export default function PartnerTab() {
  const { mode } = useWorkMode();
  return mode === 'partner' ? <PartnerEarnings /> : <PartnerLanding />;
}
