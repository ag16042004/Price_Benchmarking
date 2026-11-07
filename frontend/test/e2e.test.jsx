import { describe, it, expect } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/auth.jsx';

const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const wait = { timeout: 10000 };
/** Custom dropdowns: open the control, then click the option. */
const pick = async (user, control, name) => { await user.click(control); await user.click(await screen.findByRole('option', { name }, wait)); };
const heading = (name) => screen.findByRole('heading', { name }, wait);

async function register(user, path = '/query') {
  mount(path);
  expect(await screen.findByText('Welcome back', {}, wait)).toBeTruthy();              // route guard sent us to login
  await user.click(screen.getByRole('tab', { name: 'Create account' }));
  await user.type(screen.getByLabelText('Full name'), 'Test Officer');
  await user.type(screen.getByLabelText('Official email address'), `o${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.gov.in`);
  await user.type(screen.getByLabelText('Password'), 'password123');
  expect(await screen.findByText(/only be created with an official/i, {}, wait)).toBeTruthy();   // the @gov.in rule (read from the server) is stated up front
  await user.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('officer journey', () => {
  it('is guarded, registers, runs all three query modes, and sees history and the hub', async () => {
    const user = userEvent.setup();
    await register(user);
    await heading('Find Price Benchmarks');                                              // returned to the page they asked for

    // ---- exact make/model: validation first
    await user.click(screen.getByRole('link', { name: /Exact Make\/Model/ }));
    await heading('Exact Make/Model');
    await user.click(screen.getByRole('button', { name: 'Search sources' }));
    expect(await screen.findByText('Make is required', {}, wait)).toBeTruthy();
    expect(screen.getByText('Item type is required')).toBeTruthy();

    // ---- then a real submission
    await user.type(screen.getByLabelText('Item name *'), 'Laptop');
    await pick(user, screen.getByLabelText('Item type *'), 'Computers & Accessories');
    await user.type(screen.getByLabelText('Make / Manufacturer *'), 'Dell');
    await user.type(screen.getByLabelText('Model *'), 'Latitude 5430');
    await user.click(screen.getByRole('button', { name: 'Search sources' }));
    await heading(/Results for “Dell Latitude 5430”/);
    expect(await screen.findByText(/sample data/i, {}, wait)).toBeTruthy();              // never presented as real data
    expect(screen.getByText('₹76,999.00')).toBeTruthy();
    expect(screen.getByRole('link', { name: /View/ }).getAttribute('href')).toMatch(/^https:\/\//);

    // ---- no-data path
    await user.click(screen.getByRole('link', { name: 'Query' }));
    await user.click(await screen.findByRole('link', { name: /Exact Make\/Model/ }));
    await user.type(screen.getByLabelText('Item name *'), 'X');
    await pick(user, screen.getByLabelText('Item type *'), 'Computers & Accessories');
    await user.type(screen.getByLabelText('Make / Manufacturer *'), 'nodata');
    await user.type(screen.getByLabelText('Model *'), 'Z1');
    await user.click(screen.getByRole('button', { name: 'Search sources' }));
    expect((await screen.findAllByText('No reliable data found', {}, wait)).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Modify query' })).toBeTruthy();

    // ---- specifications
    await user.click(screen.getByRole('link', { name: 'Query' }));
    await user.click(await screen.findByRole('link', { name: /By Specifications/ }));
    await heading('Search by Specifications');
    await user.type(screen.getByLabelText('Item name *'), 'Laptop');
    await pick(user, screen.getByLabelText('Item type *'), 'Computers & Accessories');
    await user.type(screen.getByLabelText('Specification 1 name'), 'RAM');
    await user.click(screen.getByRole('button', { name: 'Search sources' }));           // value missing: row-level error
    expect(await screen.findByText('Value is required', {}, wait)).toBeTruthy();
    await user.type(screen.getByLabelText('Specification 1 value'), '16 GB');
    await user.click(screen.getByRole('button', { name: 'Add specification' }));
    await user.type(screen.getByLabelText('Specification 2 name'), 'Storage');
    await user.type(screen.getByLabelText('Specification 2 value'), '512 GB SSD');
    await user.click(screen.getByRole('button', { name: 'Search sources' }));
    await heading(/Results for “Laptop”/);
    expect(await screen.findByText('RAM: 16 GB', {}, wait)).toBeTruthy();                // requested specs shown as chips

    // ---- service
    await user.click(screen.getByRole('link', { name: 'Query' }));
    await user.click(await screen.findByRole('link', { name: /By Services/ }));
    await heading('Search for Services');
    await pick(user, screen.getByLabelText('Service type *'), 'IT Support Services');
    await user.type(screen.getByLabelText('Location *'), 'Indore, Madhya Pradesh');
    await user.type(screen.getByLabelText('Service description *'), 'On-site hardware support');
    await user.click(screen.getByRole('button', { name: 'Search service costs' }));
    await heading(/Results for “IT Support Services in Indore, Madhya Pradesh”/);

    // ---- history lists all four, newest first, and re-opens one
    await user.click(screen.getByRole('link', { name: 'History' }));
    await heading('Query history');
    const list = await screen.findByRole('list', { name: 'Saved queries' }, wait);
    const items = within(list).getAllByRole('listitem');
    expect(items.length).toBe(4);
    expect(within(items[0]).getByText(/IT Support Services in Indore/)).toBeTruthy();
    await user.click(within(items[3]).getByRole('link', { name: /Reopen/ }));
    await heading(/Results for “Dell Latitude 5430”/);

    // ---- the hub shows real counts
    await user.click(screen.getByRole('link', { name: 'Query' }));
    await heading('Find Price Benchmarks');
    expect(await screen.findByText('Recent queries', {}, wait)).toBeTruthy();
    expect((await screen.findAllByText('4', {}, wait)).length).toBeGreaterThan(0);

    // ---- an officer sees no admin link and is bounced from admin URLs
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();
    cleanup();
    mount('/admin/sources');
    await heading('Find Price Benchmarks');

    // ---- signing out returns to the login page
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByText('Welcome back', {}, wait)).toBeTruthy();
  });
});

describe('demo mode', () => {
  it('signs in with one click as the government employee, with sample queries already saved', async () => {
    const user = userEvent.setup();
    mount('/history');
    await screen.findByText('Welcome back', {}, wait);
    await user.click(await screen.findByRole('button', { name: /Continue as government employee/ }, wait));
    await heading('Query history');
    const list = await screen.findByRole('list', { name: 'Saved queries' }, wait);
    expect(within(list).getAllByRole('listitem').length).toBe(4);
    await user.click(within(within(list).getAllByRole('listitem')[0]).getByRole('link', { name: /Reopen/ }));
    expect(await screen.findByText(/not a live search result/i, {}, wait)).toBeTruthy();   // seeded rows are labelled as sample data
    expect(screen.queryByRole('link', { name: 'Admin' })).toBeNull();                       // an officer, not an admin
  });

  it('signs in with one click as the administrator', async () => {
    const user = userEvent.setup();
    mount('/admin/sources');
    await screen.findByText('Welcome back', {}, wait);
    await user.click(await screen.findByRole('button', { name: /Continue as administrator/ }, wait));
    await heading('Manage data sources');
  });
});

describe('registration rule', () => {
  it('refuses a non-gov.in address with a clear message', async () => {
    const user = userEvent.setup();
    mount('/login');
    await user.click(await screen.findByRole('tab', { name: 'Create account' }));
    await user.type(screen.getByLabelText('Full name'), 'Someone');
    await user.type(screen.getByLabelText('Official email address'), 'someone@gmail.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText(/requires an official @gov\.in/i, {}, wait)).toBeTruthy();
  });
});

describe('administrator journey', () => {
  it('signs in, manages sources and categories, and enters a curated rate', async () => {
    const user = userEvent.setup();
    mount('/admin/sources');
    await screen.findByText('Welcome back', {}, wait);
    await user.type(screen.getByLabelText('Official email address'), 'admin@example.gov.in');
    await user.type(screen.getByLabelText('Password'), 'supersecret1');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await heading('Manage data sources');
    await screen.findByText('Approved domains', {}, wait);
    await user.type(screen.getByLabelText('Search domains'), 'pasternack');                  // 100+ sources are paged, so find one by searching
    expect(await screen.findByText('pasternack.com', {}, wait)).toBeTruthy();
    await user.clear(screen.getByLabelText('Search domains'));

    // add a source (with a bad domain first)
    await user.click(screen.getByRole('button', { name: /Add source/ }));
    const dlg = await screen.findByRole('dialog');
    await user.type(within(dlg).getByLabelText('Domain *'), 'not a domain');
    await user.type(within(dlg).getByLabelText('Source name *'), 'E2E Vendor');
    await user.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/valid domain/i, {}, wait)).toBeTruthy();
    await user.clear(within(dlg).getByLabelText('Domain *'));
    await user.type(within(dlg).getByLabelText('Domain *'), 'https://www.e2e-vendor.com/shop');
    await user.click(within(dlg).getByRole('button', { name: 'Save changes' }));
    const row = (await screen.findByText('e2e-vendor.com', {}, wait)).closest('tr');   // normalized by the server
    expect(within(row).getByText('Active')).toBeTruthy();

    // deactivate it
    await user.click(within(row).getByRole('button', { name: 'Deactivate e2e-vendor.com' }));
    expect(await within((await screen.findByText('e2e-vendor.com')).closest('tr')).findByText('Inactive', {}, wait)).toBeTruthy();

    // categories: add one, see it listed
    await user.click(screen.getByRole('link', { name: 'Categories' }));
    await heading('Manage categories');
    await user.click(screen.getByRole('button', { name: /Add item type/ }));
    const cdlg = await screen.findByRole('dialog');
    await user.type(within(cdlg).getByLabelText('Category name *'), 'E2E Drones');
    await user.click(within(cdlg).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('E2E Drones', {}, wait)).toBeTruthy();

    // curated service rate
    await user.click(screen.getByRole('link', { name: 'Service rates' }));
    await heading('Service rates');
    await user.click(screen.getByRole('button', { name: /Add rate/ }));
    const rdlg = await screen.findByRole('dialog');
    await pick(user, within(rdlg).getByLabelText('Service type *'), 'IT Support Services');
    await user.type(within(rdlg).getByLabelText('Location (city) *'), 'Indore');
    await user.type(within(rdlg).getByLabelText('Price *'), '2500');
    await user.type(within(rdlg).getByLabelText('Source name *'), 'MP Rate Contract');
    await user.type(within(rdlg).getByLabelText('Source link *'), 'https://example.gov.in/rates');
    await user.type(within(rdlg).getByLabelText('Date published *'), '2026-08-01');
    await user.click(within(rdlg).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('MP Rate Contract', {}, wait)).toBeTruthy();
    expect(screen.getByText('₹2,500.00')).toBeTruthy();
  });
});
