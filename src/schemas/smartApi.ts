import { z } from 'zod';

// Schema for cache entries of instruments
export const InstrumentCacheEntrySchema = z.object({
  symboltoken: z.string(),
  tradingsymbol: z.string(),
  lotsize: z.coerce.number(),
  exchange: z.string(),
});
export type InstrumentCacheEntry = z.infer<typeof InstrumentCacheEntrySchema>;

// Instrument cache maps {underlying}_{expiry}_{strike}_{optionType} -> InstrumentCacheEntry
export const InstrumentCacheSchema = z.record(InstrumentCacheEntrySchema);
export type InstrumentCache = z.infer<typeof InstrumentCacheSchema>;

// Raw scrip master row validation schema
export const RawScripMasterRowSchema = z.object({
  token: z.string(),
  symbol: z.string(),
  name: z.string(),
  expiry: z.string().optional().or(z.literal('')),
  strike: z.coerce.number().optional().or(z.literal('')),
  lotsize: z.coerce.number(),
  instrumenttype: z.string().optional().or(z.literal('')),
  exch_seg: z.string(),
  tick_size: z.coerce.number().optional(),
});
export type RawScripMasterRow = z.infer<typeof RawScripMasterRowSchema>;

// Angel One response schemas
export const SmartApiLoginResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z
    .object({
      jwtToken: z.string(),
      refreshToken: z.string(),
      feedToken: z.string(),
    })
    .optional()
    .nullable(),
});
export type SmartApiLoginResponse = z.infer<typeof SmartApiLoginResponseSchema>;

export const SmartApiOrderResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z
    .object({
      script: z.string().optional(),
      orderid: z.string(),
      uniqueorderid: z.string().optional(),
    })
    .optional()
    .nullable(),
});
export type SmartApiOrderResponse = z.infer<typeof SmartApiOrderResponseSchema>;

export const OrderBookItemSchema = z.object({
  orderid: z.string(),
  status: z.string(), // COMPLETE, REJECTED, CANCELLED, etc.
  tradingsymbol: z.string(),
  symboltoken: z.string(),
  transactiontype: z.string(),
  quantity: z.coerce.number(),
  price: z.coerce.number(),
  averageprice: z.coerce.number().optional(),
  text: z.string().optional(),
});
export type OrderBookItem = z.infer<typeof OrderBookItemSchema>;

export const SmartApiOrderBookResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z.array(OrderBookItemSchema).optional().nullable(),
});
export type SmartApiOrderBookResponse = z.infer<typeof SmartApiOrderBookResponseSchema>;

export const SmartApiLtpResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z
    .object({
      exchange: z.string(),
      tradingsymbol: z.string(),
      symboltoken: z.string(),
      ltp: z.coerce.number(),
    })
    .optional()
    .nullable(),
});
export type SmartApiLtpResponse = z.infer<typeof SmartApiLtpResponseSchema>;

export const SmartApiQuoteResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z
    .object({
      fetched: z
        .array(
          z.object({
            exchange: z.string(),
            tradingSymbol: z.string(),
            symbolToken: z.string(),
            ltp: z.coerce.number(),
            depth: z
              .object({
                buy: z
                  .array(
                    z.object({
                      price: z.coerce.number(),
                      quantity: z.coerce.number(),
                      nooforders: z.coerce.number().optional(),
                    }),
                  )
                  .optional()
                  .nullable(),
                sell: z
                  .array(
                    z.object({
                      price: z.coerce.number(),
                      quantity: z.coerce.number(),
                      nooforders: z.coerce.number().optional(),
                    }),
                  )
                  .optional()
                  .nullable(),
              })
              .optional()
              .nullable(),
          }),
        )
        .optional()
        .nullable(),
    })
    .optional()
    .nullable(),
});
export type SmartApiQuoteResponse = z.infer<typeof SmartApiQuoteResponseSchema>;

// Batch margin request response schema
export const MarginCalculatorResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z
    .object({
      totalMargin: z.preprocess((val) => {
        const num = Number(val);
        return isNaN(num) ? undefined : num;
      }, z.number().optional()),
      totalMarginRequired: z.coerce.number().optional(),
      marginUtilized: z.coerce.number().optional(), // standard response field
      netMaxMargin: z.coerce.number().optional(),
    })
    .optional()
    .nullable(),
});
export type MarginCalculatorResponse = z.infer<typeof MarginCalculatorResponseSchema>;
// Option Greeks response schemas
export const OptionGreekItemSchema = z.object({
  name: z.string(),
  expiry: z.string(),
  strikePrice: z.coerce.number(),
  optionType: z.enum(['CE', 'PE']),
  delta: z.coerce.number().optional().nullable(),
  gamma: z.coerce.number().optional().nullable(),
  theta: z.coerce.number().optional().nullable(),
  vega: z.coerce.number().optional().nullable(),
  impliedVolatility: z.coerce.number(),
});
export type OptionGreekItem = z.infer<typeof OptionGreekItemSchema>;

export const SmartApiOptionGreeksResponseSchema = z.object({
  status: z.boolean(),
  message: z.string(),
  errorcode: z.string(),
  data: z.array(OptionGreekItemSchema).nullable().optional(),
});
export type SmartApiOptionGreeksResponse = z.infer<typeof SmartApiOptionGreeksResponseSchema>;

// State Tracking Positions schema (week-wise)
export const OrderRecordSchema = z.object({
  symboltoken: z.string(),
  tradingsymbol: z.string(),
  transactiontype: z.enum(['BUY', 'SELL']),
  quantity: z.number(),
  exchange: z.string(),
  orderid: z.string(),
  status: z.string(),
  price: z.number(),
});
export type OrderRecord = z.infer<typeof OrderRecordSchema>;

export const MonthlyPositionSchema = z.object({
  month: z.string(), // e.g. 2026-07
  status: z.enum(['open', 'closed', 'skipped']),
  marginUtilized: z.number(),
  orders: z.array(OrderRecordSchema),
  realizedPnl: z.number(),
  unrealizedPnl: z.number().optional(),
  mtm: z.number().optional(),
  skippedThisMonth: z.boolean(),
  vixAtEntry: z.number().optional(),
});
export type MonthlyPosition = z.infer<typeof MonthlyPositionSchema>;
