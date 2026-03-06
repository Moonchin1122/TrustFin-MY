export interface LoanCategory {
  id: string;
  translationKey: string;
  icon: string;
  color: string;
  bgColor: string;
}

export interface LoanGuide {
  id: string;
  translationKey: string;
  steps: string[];
  documents: string[];
  defaultRate: number;
  minAmount: number;
  maxAmount: number;
  minTenure: number;
  maxTenure: number;
}

export const loanCategories: LoanCategory[] = [
  { id: 'homeLoan', translationKey: 'homeLoan', icon: 'Home', color: '#D4A843', bgColor: '#FDF5E6' },
  { id: 'personalLoan', translationKey: 'personalLoan', icon: 'Wallet', color: '#0A1E3D', bgColor: '#E8F0FE' },
  { id: 'carLoan', translationKey: 'carLoan', icon: 'Car', color: '#2ECC71', bgColor: '#E8F8EE' },
  { id: 'businessLoan', translationKey: 'businessLoan', icon: 'Briefcase', color: '#8B5CF6', bgColor: '#F0EBFE' },
  { id: 'creditCard', translationKey: 'creditCard', icon: 'CreditCard', color: '#E74C3C', bgColor: '#FDECEC' },
  { id: 'refinancing', translationKey: 'refinancing', icon: 'RefreshCw', color: '#F39C12', bgColor: '#FEF5E7' },
  { id: 'educationLoan', translationKey: 'educationLoan', icon: 'GraduationCap', color: '#3498DB', bgColor: '#EBF5FB' },
  { id: 'quickCash', translationKey: 'quickCash', icon: 'Banknote', color: '#1ABC9C', bgColor: '#E8FBF5' },
];

export const loanGuides: Record<string, LoanGuide> = {
  homeLoan: {
    id: 'homeLoan',
    translationKey: 'homeLoan',
    steps: ['guideStep_home_1', 'guideStep_home_2', 'guideStep_home_3', 'guideStep_home_4', 'guideStep_home_5'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_epf', 'guideDoc_bankStatement', 'guideDoc_spa', 'guideDoc_propertyVal'],
    defaultRate: 4.5,
    minAmount: 100000,
    maxAmount: 2000000,
    minTenure: 5,
    maxTenure: 35,
  },
  personalLoan: {
    id: 'personalLoan',
    translationKey: 'personalLoan',
    steps: ['guideStep_personal_1', 'guideStep_personal_2', 'guideStep_personal_3', 'guideStep_personal_4'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_bankStatement', 'guideDoc_employer'],
    defaultRate: 6.0,
    minAmount: 5000,
    maxAmount: 200000,
    minTenure: 1,
    maxTenure: 10,
  },
  carLoan: {
    id: 'carLoan',
    translationKey: 'carLoan',
    steps: ['guideStep_car_1', 'guideStep_car_2', 'guideStep_car_3', 'guideStep_car_4'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_bankStatement', 'guideDoc_carQuote', 'guideDoc_drivingLicense'],
    defaultRate: 3.5,
    minAmount: 20000,
    maxAmount: 500000,
    minTenure: 3,
    maxTenure: 9,
  },
  businessLoan: {
    id: 'businessLoan',
    translationKey: 'businessLoan',
    steps: ['guideStep_biz_1', 'guideStep_biz_2', 'guideStep_biz_3', 'guideStep_biz_4', 'guideStep_biz_5'],
    documents: ['guideDoc_ic', 'guideDoc_ssm', 'guideDoc_bizBankStatement', 'guideDoc_financialReport', 'guideDoc_bizPlan'],
    defaultRate: 5.5,
    minAmount: 50000,
    maxAmount: 5000000,
    minTenure: 1,
    maxTenure: 15,
  },
  creditCard: {
    id: 'creditCard',
    translationKey: 'creditCard',
    steps: ['guideStep_cc_1', 'guideStep_cc_2', 'guideStep_cc_3'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_bankStatement'],
    defaultRate: 18.0,
    minAmount: 1000,
    maxAmount: 100000,
    minTenure: 1,
    maxTenure: 5,
  },
  refinancing: {
    id: 'refinancing',
    translationKey: 'refinancing',
    steps: ['guideStep_refi_1', 'guideStep_refi_2', 'guideStep_refi_3', 'guideStep_refi_4'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_bankStatement', 'guideDoc_existingLoanLetter', 'guideDoc_propertyVal'],
    defaultRate: 4.0,
    minAmount: 100000,
    maxAmount: 2000000,
    minTenure: 5,
    maxTenure: 35,
  },
  educationLoan: {
    id: 'educationLoan',
    translationKey: 'educationLoan',
    steps: ['guideStep_edu_1', 'guideStep_edu_2', 'guideStep_edu_3', 'guideStep_edu_4'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_offerLetter', 'guideDoc_bankStatement'],
    defaultRate: 4.0,
    minAmount: 10000,
    maxAmount: 500000,
    minTenure: 1,
    maxTenure: 15,
  },
  quickCash: {
    id: 'quickCash',
    translationKey: 'quickCash',
    steps: ['guideStep_quick_1', 'guideStep_quick_2', 'guideStep_quick_3'],
    documents: ['guideDoc_ic', 'guideDoc_payslip', 'guideDoc_bankStatement'],
    defaultRate: 8.0,
    minAmount: 1000,
    maxAmount: 50000,
    minTenure: 1,
    maxTenure: 5,
  },
};
