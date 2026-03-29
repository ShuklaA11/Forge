'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { PIPELINE_STAGE_LABELS, CONVERSATION_STAGE_LABELS } from '@/types';
import { formatRelativeDate } from '@/lib/utils';

interface LeadData {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string | null;
  currentStage: string;
  conversationStage: string;
  priorityScore: number;
  touchpoints: { sentAt: Date }[];
  _count: { touchpoints: number; calls: number };
}

export function CompanyGroup({ companyName, leads }: { companyName: string; leads: LeadData[] }) {
  const [expanded, setExpanded] = useState(true);

  const avgScore = Math.round(leads.reduce((s, l) => s + l.priorityScore, 0) / leads.length);
  const totalCalls = leads.reduce((s, l) => s + l._count.calls, 0);

  return (
    <Card>
      <Button
        variant="ghost"
        className="w-full justify-start p-4 h-auto hover:bg-muted/50 rounded-b-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 w-full">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-medium">{companyName}</span>
          <div className="flex items-center gap-2 ml-auto">
            <Badge variant="outline" className="text-xs">{leads.length} {leads.length === 1 ? 'contact' : 'contacts'}</Badge>
            {totalCalls > 0 && <Badge variant="outline" className="text-xs">{totalCalls} {totalCalls === 1 ? 'call' : 'calls'}</Badge>}
            <Badge className={avgScore >= 70 ? 'bg-green-600' : avgScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}>
              Avg: {avgScore}
            </Badge>
          </div>
        </div>
      </Button>
      {expanded && (
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Pipeline</TableHead>
                <TableHead>Conv. Stage</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Calls</TableHead>
                <TableHead>Last Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {leads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <Link href={`/leads/${lead.id}`} className="font-medium hover:underline">{lead.firstName} {lead.lastName}</Link>
                    {lead.title && <div className="text-xs text-muted-foreground">{lead.title}</div>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{PIPELINE_STAGE_LABELS[lead.currentStage]}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{CONVERSATION_STAGE_LABELS[lead.conversationStage]}</Badge></TableCell>
                  <TableCell><Badge className={lead.priorityScore >= 70 ? 'bg-green-600' : lead.priorityScore >= 40 ? 'bg-yellow-600' : 'bg-gray-600'}>{lead.priorityScore}</Badge></TableCell>
                  <TableCell>{lead._count.calls}</TableCell>
                  <TableCell className="text-muted-foreground">{lead.touchpoints[0] ? formatRelativeDate(lead.touchpoints[0].sentAt) : 'Never'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  );
}
