// Maintenance domain modals:
//   • CreateCustomerModal
//   • EditCustomerModal
//   • CreatePropertyModal
//   • EditPropertyModal
//   • InvitePortalUserModal

import { useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { FRAUNCES } from '../gantt/components/ledger';
import {
  createCustomer,
  updateCustomer,
  type Customer,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from '../../lib/api/customers';
import {
  createProperty,
  updateProperty,
  type Property,
  type CreatePropertyInput,
  type UpdatePropertyInput,
} from '../../lib/api/properties';

// ─── customer type suggestions ───────────────────────────────────────────────
// Stored as free-text in customers.customer_type — these are displayed as a
// select but the user can also leave blank. Not an enum constraint in the DB.
const CUSTOMER_TYPE_OPTIONS = [
  '',
  'Residential',
  'Commercial',
  'Agricultural',
  'Strata',
  'Builder',
  'School',
];
import { inviteCustomerUser } from '../../lib/api/admin';

// ─── shared helpers ──────────────────────────────────────────────────────────

const MODAL_SHELL =
  'fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/50 p-4';
const DIALOG_SHELL =
  'flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]';

function ModalHeader({
  kicker,
  title,
  onClose,
}: {
  kicker: string;
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
          {kicker}
        </p>
        <h2
          className="mt-1 text-xl font-medium text-[#1A1A1A]"
          style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
        >
          {title}
        </h2>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
      {children}
      {required && <span className="ml-1 text-[#C44545]">*</span>}
    </label>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
      {msg}
    </p>
  );
}

// ─── CreateCustomerModal ──────────────────────────────────────────────────────

interface CreateCustomerModalProps {
  open: boolean;
  onClose: () => void;
  /** propertyAttached is true when a first property was also created. */
  onCreated: (c: Customer, propertyAttached: boolean) => void;
  onError: (msg: string) => void;
}

export function CreateCustomerModal({
  open,
  onClose,
  onCreated,
  onError,
}: CreateCustomerModalProps) {
  const [name, setName] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [firstPropertyAddress, setFirstPropertyAddress] = useState('');
  const [contactName, setContactName] = useState('');
  // Note: email is optional in our schema — portal invites handle customer accounts separately.
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName('');
    setCustomerType('');
    setFirstPropertyAddress('');
    setContactName('');
    setContactEmail('');
    setPhone('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Customer name is required.');
    setSaving(true);
    try {
      const input: CreateCustomerInput = {
        name: name.trim(),
        customerType: customerType.trim() || null,
        primaryContactName: contactName.trim() || undefined,
        primaryContactEmail: contactEmail.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const c = await createCustomer(input);

      // Optionally attach first property — isolated so a property failure cannot
      // prevent the customer record from being surfaced to the caller.
      const addr = firstPropertyAddress.trim();
      let propertyAttached = false;
      if (addr) {
        try {
          await createProperty({ customerId: c.id, name: 'Primary property', address: addr });
          propertyAttached = true;
        } catch (propErr) {
          const propMsg =
            propErr instanceof Error ? propErr.message : 'Unknown error.';
          reset();
          onCreated(c, false);
          onClose();
          onError(
            `Customer added — but the first property could not be saved: ${propMsg}. Add it from their profile.`,
          );
          return;
        }
      }

      reset();
      onCreated(c, propertyAttached);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create customer.';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className={DIALOG_SHELL}>
        <ModalHeader kicker="Maintenance · Customers" title="New customer" onClose={handleClose} />
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel required>Customer / company name</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Casone Electrical"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel>Type</FieldLabel>
                <select
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value)}
                  disabled={saving}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                >
                  {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt === '' ? '—' : opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>First property address (optional)</FieldLabel>
                <Input
                  value={firstPropertyAddress}
                  onChange={(e) => setFirstPropertyAddress(e.target.value)}
                  placeholder="123 Main Street"
                  disabled={saving}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Primary contact name</FieldLabel>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel>Contact email</FieldLabel>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@example.com"
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0412 345 678"
                disabled={saving}
              />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                placeholder="Internal notes about this customer…"
              />
            </div>
            {error && <ErrorBanner msg={error} />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create customer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── EditCustomerModal ────────────────────────────────────────────────────────

interface EditCustomerModalProps {
  open: boolean;
  customer: Customer;
  onClose: () => void;
  onUpdated: (c: Customer) => void;
  onError: (msg: string) => void;
}

export function EditCustomerModal({
  open,
  customer,
  onClose,
  onUpdated,
  onError,
}: EditCustomerModalProps) {
  const [name, setName] = useState(customer.name);
  const [customerType, setCustomerType] = useState(customer.customerType ?? '');
  const [contactName, setContactName] = useState(customer.primaryContactName ?? '');
  const [contactEmail, setContactEmail] = useState(customer.primaryContactEmail ?? '');
  const [phone, setPhone] = useState(customer.phone ?? '');
  const [notes, setNotes] = useState(customer.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Customer name is required.');
    setSaving(true);
    try {
      const patch: UpdateCustomerInput = {
        name: name.trim(),
        customerType: customerType.trim() === '' ? null : customerType.trim(),
        primaryContactName: contactName.trim() === '' ? null : contactName.trim(),
        primaryContactEmail: contactEmail.trim() === '' ? null : contactEmail.trim(),
        phone: phone.trim() === '' ? null : phone.trim(),
        notes: notes.trim() === '' ? null : notes.trim(),
      };
      const updated = await updateCustomer(customer.id, patch);
      onUpdated(updated);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update customer.';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className={DIALOG_SHELL}>
        <ModalHeader kicker="Maintenance · Customers" title="Edit customer" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel required>Customer / company name</FieldLabel>
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
              </div>
              <div>
                <FieldLabel>Type</FieldLabel>
                <select
                  value={customerType}
                  onChange={(e) => setCustomerType(e.target.value)}
                  disabled={saving}
                  className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                >
                  {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt === '' ? '—' : opt}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Primary contact name</FieldLabel>
                <Input
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel>Contact email</FieldLabel>
                <Input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Phone</FieldLabel>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={saving} />
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
              />
            </div>
            {error && <ErrorBanner msg={error} />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CreatePropertyModal ──────────────────────────────────────────────────────

interface CreatePropertyModalProps {
  open: boolean;
  customerId: string;
  onClose: () => void;
  onCreated: (p: Property) => void;
  onError: (msg: string) => void;
}

export function CreatePropertyModal({
  open,
  customerId,
  onClose,
  onCreated,
  onError,
}: CreatePropertyModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setName('');
    setAddress('');
    setSuburb('');
    setNotes('');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Property name is required.');
    setSaving(true);
    try {
      const input: CreatePropertyInput = {
        customerId,
        name: name.trim(),
        address: address.trim() || undefined,
        suburb: suburb.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const p = await createProperty(input);
      reset();
      onCreated(p);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create property.';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className={DIALOG_SHELL}>
        <ModalHeader kicker="Maintenance · Properties" title="Add property" onClose={handleClose} />
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div>
              <FieldLabel required>Property name</FieldLabel>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. 12 Smith St — Unit 4"
                disabled={saving}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Street address</FieldLabel>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main Street"
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel>Suburb</FieldLabel>
                <Input
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  placeholder="Suburb"
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
                placeholder="Access notes, gate codes, special instructions…"
              />
            </div>
            {error && <ErrorBanner msg={error} />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Adding…' : 'Add property'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── EditPropertyModal ────────────────────────────────────────────────────────

interface EditPropertyModalProps {
  open: boolean;
  property: Property;
  onClose: () => void;
  onUpdated: (p: Property) => void;
  onError: (msg: string) => void;
}

export function EditPropertyModal({
  open,
  property,
  onClose,
  onUpdated,
  onError,
}: EditPropertyModalProps) {
  const [name, setName] = useState(property.name);
  const [address, setAddress] = useState(property.address ?? '');
  const [suburb, setSuburb] = useState(property.suburb ?? '');
  const [notes, setNotes] = useState(property.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError('Property name is required.');
    setSaving(true);
    try {
      const patch: UpdatePropertyInput = {
        name: name.trim(),
        address: address.trim() === '' ? null : address.trim(),
        suburb: suburb.trim() === '' ? null : suburb.trim(),
        notes: notes.trim() === '' ? null : notes.trim(),
      };
      const updated = await updateProperty(property.id, patch);
      onUpdated(updated);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update property.';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className={DIALOG_SHELL}>
        <ModalHeader kicker="Maintenance · Properties" title="Edit property" onClose={onClose} />
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div>
              <FieldLabel required>Property name</FieldLabel>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel>Street address</FieldLabel>
                <Input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel>Suburb</FieldLabel>
                <Input
                  value={suburb}
                  onChange={(e) => setSuburb(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Notes</FieldLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                disabled={saving}
                className="block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50"
              />
            </div>
            {error && <ErrorBanner msg={error} />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── InvitePortalUserModal ────────────────────────────────────────────────────

interface InvitePortalUserModalProps {
  open: boolean;
  customerId: string;
  customerName: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

function generatePassword(): string {
  const chars =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  const randomValues = crypto.getRandomValues(new Uint32Array(12));
  let pwd = '';
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(randomValues[i] % chars.length);
  }
  return pwd;
}

export function InvitePortalUserModal({
  open,
  customerId,
  customerName,
  onClose,
  onSuccess,
  onError,
}: InvitePortalUserModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [shownPassword, setShownPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const reset = () => {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPassword('');
    setShownPassword(null);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleGenerate = () => {
    const p = generatePassword();
    setPassword(p);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim()) return setError('First name is required.');
    if (!lastName.trim()) return setError('Last name is required.');
    if (!email.trim()) return setError('Email is required.');
    if (!password) return setError('Password is required.');
    setSaving(true);
    try {
      await inviteCustomerUser({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        customerId,
      });
      const finalPwd = password;
      reset();
      setShownPassword(finalPwd);
      onSuccess(`Portal user invited — share the password shown below with ${firstName}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to invite user.';
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  // Post-success — show password once then close
  if (shownPassword) {
    return (
      <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div className={DIALOG_SHELL}>
          <ModalHeader kicker="Portal user invited" title="Share this password" onClose={handleClose} />
          <div className="flex-1 space-y-4 px-6 py-5">
            <p className="text-sm text-[#6B6B6B]">
              The portal user has been created for <strong>{customerName}</strong>. Share this
              temporary password with the user — it will not be shown again.
            </p>
            <div className="rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3">
              <p className="font-mono text-lg font-semibold tracking-widest text-[#1A1A1A]">
                {shownPassword}
              </p>
            </div>
            <p className="text-xs text-[#A0A0A0]">
              The user can change their password after their first login.
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" onClick={handleClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={MODAL_SHELL} style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div className={DIALOG_SHELL}>
        <ModalHeader
          kicker={`Maintenance · ${customerName}`}
          title="Invite portal user"
          onClose={handleClose}
        />
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <p className="text-sm text-[#6B6B6B]">
              Creates a login for a customer contact so they can submit and track requests via the
              portal. Their account will be linked to <strong>{customerName}</strong>.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel required>First name</FieldLabel>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div>
                <FieldLabel required>Last name</FieldLabel>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div>
              <FieldLabel required>Email address</FieldLabel>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="customer@example.com"
                disabled={saving}
              />
            </div>
            <div>
              <FieldLabel required>Temporary password</FieldLabel>
              <div className="flex gap-2">
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter or generate a password"
                  disabled={saving}
                  className="flex-1 font-mono"
                />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-[12px] font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2] disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Generate
                </button>
              </div>
              {password && (
                <p className="mt-1 font-mono text-xs text-[#6B6B6B]">Preview: {password}</p>
              )}
            </div>
            {error && <ErrorBanner msg={error} />}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Inviting…' : 'Invite user'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
