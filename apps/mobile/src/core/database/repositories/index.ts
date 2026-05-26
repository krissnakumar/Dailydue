import { LocalDatabase } from '../LocalDatabase';

export const customerRepository = {
  saveCustomerLocally: async (customer: any) => {
    return LocalDatabase.getInstance().insertCustomer(customer);
  },
  getCustomerLocally: async (id: string) => {
    const list = await LocalDatabase.getInstance().getCustomers();
    return list.find(c => c.id === id);
  },
};
