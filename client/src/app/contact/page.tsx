import LegalPageShell from '@/components/brand/LegalPageShell';

export const metadata = { title: 'Contact | Stream Vault' };

export default function ContactPage() {
  return (
    <LegalPageShell title="Contact">
      <p>
        Stream Vault is built and maintained by Aligncraft. For support,
        partnership inquiries, or press, reach out through the channel that
        fits best:
      </p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Product support — for account or streaming issues</li>
        <li>Creator partnerships — for monetization and sponsorship questions</li>
        <li>Press &amp; media — for interviews or coverage requests</li>
      </ul>
      <p>
        Add your team&apos;s preferred email addresses or a contact form here once
        they&apos;re finalized.
      </p>
    </LegalPageShell>
  );
}
