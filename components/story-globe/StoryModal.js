"use client";

// The component already manages commentMentionResults in response to a query.
// Keep the existing async effect but avoid a synchronous state write when the
// query is empty; the derived UI can treat an empty query as an empty result.
