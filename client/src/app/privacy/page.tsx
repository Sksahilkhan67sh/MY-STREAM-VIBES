import LegalPageShell from '@/components/brand/LegalPageShell';

export const metadata = { title: 'Privacy Policy | Stream Vault' };

export default function PrivacyPage() {
  return (
    <LegalPageShell title="Privacy Policy">
      <p>
        This page is a placeholder. Replace this content with Aligncraft&apos;s full
        privacy policy covering what data Stream Vault collects, how it&apos;s used,
        and the choices available to you.
      </p>
      <p>
        In the meantime, account data, watch history, and creator earnings
        information are handled according to the practices described
        throughout the product — for example, in your{' '}
        <a href="/settings" className="text-red-500 hover:underline">Settings</a> page,
        where you can control profile visibility and notification preferences.
      </p>
      <p>
        Questions about privacy can be directed to the team via the{' '}
        <a href="/contact" className="text-red-500 hover:underline">Contact</a> page.
      </p>
    </LegalPageShell>
  );
}
