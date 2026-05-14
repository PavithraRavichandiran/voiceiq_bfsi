const { z } = require('zod');

const MoneyField = z.object({
  value:      z.number(),
  currency:   z.literal('INR'),
  confidence: z.number().min(0).max(1),
}).nullable();

const TenureField = z.object({
  value:      z.number(),
  unit:       z.enum(['months', 'years']),
  confidence: z.number().min(0).max(1),
}).nullable();

const RateField = z.object({
  value:      z.number(),
  unit:       z.literal('percent'),
  confidence: z.number().min(0).max(1),
}).nullable();

const ProductTypeField = z.object({
  value: z.enum([
    'personal_loan', 'home_loan', 'car_loan', 'credit_card',
    'insurance', 'fd', 'rd', 'mutual_fund',
  ]),
  confidence: z.number().min(0).max(1),
}).nullable();

const PanField = z.object({
  value:      z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'Invalid PAN format'),
  confidence: z.number().min(0).max(1),
}).nullable();

const CallIntentField = z.object({
  value: z.enum([
    'loan_enquiry', 'complaint', 'data_validation',
    'emi_payment', 'collections', 'general_enquiry',
  ]),
  confidence: z.number().min(0).max(1),
}).nullable();

const EntitiesSchema = z.object({
  loan_amount:    MoneyField,
  loan_tenure:    TenureField,
  emi_amount:     MoneyField,
  product_type:   ProductTypeField,
  pan_number:     PanField,
  monthly_income: MoneyField,
  interest_rate:  RateField,
  call_intent:    CallIntentField,
});

module.exports = { EntitiesSchema };
