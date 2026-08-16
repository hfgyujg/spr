import React, { useEffect, useState } from 'react';
import { SPR } from '@sprtrust/sdk';

export function SPRTrustBadge({ apiKey, softwareId, baseUrl, href }: { apiKey: string; softwareId: string; baseUrl?: string; href?: string }) {
  const [score, setScore] = useState<number | null>(null);
  const [status, setStatus] = useState('Loading');
  useEffect(() => {
    const client = new SPR({ apiKey, baseUrl });
    client.passports.trust(softwareId).then((data: any) => {
      setScore(typeof data.score === 'number' ? data.score : null);
      setStatus(data.observation ? 'Observed' : 'Unobserved');
    }).catch(() => setStatus('Unavailable'));
  }, [apiKey, softwareId, baseUrl]);
  const content = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 999, background: '#0A1628', color: '#D4AF37', border: '1px solid #D4AF37', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, fontWeight: 700 }}>
    <span>SPR</span><span>{score === null ? status : `Trust ${score}`}</span>
  </span>;
  return href ? <a href={href} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{content}</a> : content;
}

export function SPRTrustScore({ apiKey, passportId, baseUrl }: { apiKey: string; passportId: string; baseUrl?: string }) {
  const [score, setScore] = useState<number | null>(null);
  useEffect(() => { new SPR({ apiKey, baseUrl }).passports.trust(passportId).then((d: any) => setScore(typeof d.score === 'number' ? d.score : null)).catch(() => setScore(null)); }, [apiKey, passportId, baseUrl]);
  return <strong>{score === null ? '—' : score}</strong>;
}
