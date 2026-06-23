import LegalPageShell from '@/components/brand/LegalPageShell';

export const metadata = { title: 'Terms of Service | Stream Vault' };

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms of Service">
      <p>
        This page is a placeholder. Replace this content with Aligncraft's full
        terms of service governing use of Stream Vault — acceptable use,
        creator monetization terms, payouts, content ownership, and account
        termination.
      </p>
      <p>
        Stream Vault is provided by Aligncraft. By creating an account or
        watching a stream, you agree to use the platform responsibly and in
        line with the community guidelines enforced throughout the product.
      </p>
      <p>
        Questions about these terms can be directed to the team via the{' '}
        <a href="/contact" className="text-red-500 hover:underline">Contact</a> page.
      </p>
    </LegalPageShell>
  );
}
