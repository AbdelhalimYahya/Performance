import fastJson from 'fast-json-stringify';

// ============================================================================
// Product Schema
// ============================================================================

export const productSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    category: { type: 'string' },
    price: { type: 'number' },
    stock: { type: 'integer' },
    isActive: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
    variants: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          size: { type: 'string' },
          color: { type: 'string' },
          sku: { type: 'string' },
        },
      },
    },
    createdAt: { type: 'string' },
  },
};

export const serializeProduct = fastJson(productSchema);

// ============================================================================
// ProductList Schema
// ============================================================================

export const productListSchema = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: productSchema,
    },
    total: { type: 'integer' },
    page: { type: 'integer' },
  },
};

export const serializeProductList = fastJson(productListSchema);

// ============================================================================
// ProductSummary Schema — subset of fields for lightweight responses
// ============================================================================

export const productSummarySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    price: { type: 'number' },
    category: { type: 'string' },
    isActive: { type: 'boolean' },
  },
};

export const serializeProductSummary = fastJson(productSummarySchema);
