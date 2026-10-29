'use client';

import { use } from 'react';
import { IgFlowDetail } from '@/features/ig-flows/components/ig-flow-detail';

export default function IgFlowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <IgFlowDetail id={id} />;
}
