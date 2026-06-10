// /pricing — public-ish marketing page mock. Three tiers (Free / Pro /
// Enterprise) with placeholder numbers; the SaaS shape is what's load-
// bearing for the sales motion. The ROI calculator at the bottom is a
// separate component but lives on the same page so a stakeholder can
// scroll from price → estimated value in one motion.

import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import RoiCalculator from './RoiCalculator';
import { fadeUp, staggerContainer } from '../lib/motion/variants';

interface Tier {
  name: string;
  blurb: string;
  priceMonthly: string;
  priceCaption: string;
  cta: string;
  ctaHref: string;
  features: string[];
  highlight?: boolean;
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    blurb: 'One small jobsite. Photo capture, basic Gantt, no AI.',
    priceMonthly: '$0',
    priceCaption: 'forever · 1 project · 50 photos / mo',
    cta: 'Start free',
    ctaHref: '/dashboard',
    features: [
      'Photo capture + storage (50/mo)',
      'Single project Gantt',
      'Mock-AI demo runs (10/mo)',
      'Up to 3 teammates',
      'Email support',
    ],
  },
  {
    name: 'Pro',
    blurb: 'Crews of 5–25. Real AI on every photo, unlimited projects.',
    priceMonthly: '$129',
    priceCaption: 'per active site / month',
    cta: 'Start 14-day trial',
    ctaHref: '/dashboard',
    features: [
      'Unlimited photos + projects',
      'Real Claude Vision analysis (priced at cost)',
      'AI Writing Assistant (Polish + structured fill)',
      'Owner-tier force-progress + audit log',
      'Realtime collaboration · Reset-demo workflow',
      'Up to 25 teammates',
      'Priority support',
    ],
    highlight: true,
  },
  {
    name: 'Enterprise',
    blurb: 'Multi-site GCs. SSO, on-prem options, custom integrations.',
    priceMonthly: 'Talk to us',
    priceCaption: 'volume-priced · annual contract',
    cta: 'Book a call',
    ctaHref: 'mailto:sales@siteproof.dev',
    features: [
      'Everything in Pro',
      'SSO + SCIM provisioning',
      'Custom permissions matrix',
      'BYOK Anthropic billing',
      'Procore / Buildertrend / Aconex integrations',
      'On-prem / private-cloud deployment',
      'Dedicated CSM + onboarding',
    ],
  },
];

export default function Pricing() {
  return (
    <motion.div
      className="bg-[#FAFAF7]"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      {/* ─── Hero ─── */}
      <motion.section variants={fadeUp} className="border-b border-slate-200 px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-5xl">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
            <span className="inline-block h-px w-6 bg-slate-400" />
            Pricing
          </p>
          <h1
            className="max-w-3xl text-3xl font-medium leading-tight text-slate-900 sm:text-4xl"
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              fontFeatureSettings: "'ss01'",
              letterSpacing: '-0.02em',
            }}
          >
            Built for crews who'd rather <em className="font-medium not-italic text-emerald-700">build</em> than admin.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
            One per-site price. AI usage priced at-cost so a busier site doesn't
            mean a punishing bill. 14-day Pro trial — no card up front.
          </p>
        </div>
      </motion.section>

      {/* ─── Tiers ─── */}
      <motion.section variants={fadeUp} className="px-4 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-4 md:grid-cols-3">
            {TIERS.map((tier) => (
              <TierCard key={tier.name} tier={tier} />
            ))}
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-[11px] text-slate-400">
            Pricing in AUD. Prices ex-tax. AI analysis costs roughly $0.01 per photo
            processed by Claude Vision — Pro plans absorb the first 500/site/month,
            anything past that bills at-cost.
          </p>
        </div>
      </motion.section>

      {/* ─── ROI calculator ─── */}
      <motion.section variants={fadeUp} className="border-t border-slate-200 px-4 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
            <span className="inline-block h-px w-6 bg-slate-400" />
            ROI calculator
          </p>
          <h2
            className="text-2xl font-medium leading-tight text-slate-900 sm:text-3xl"
            style={{
              fontFamily: "'Fraunces', Georgia, serif",
              letterSpacing: '-0.02em',
            }}
          >
            How much would SiteProof save your team?
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
            Ballpark numbers — adjust to your reality. We assume each photo-driven
            update saves ~4 minutes of paperwork; each AI-polished diary entry
            saves ~6 minutes.
          </p>
          <div className="mt-6">
            <RoiCalculator />
          </div>
        </div>
      </motion.section>

      {/* ─── Footer CTA ─── */}
      <motion.section variants={fadeUp} className="border-t border-slate-200 px-4 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 text-center">
          <h3
            className="text-xl font-medium text-slate-900 sm:text-2xl"
            style={{ fontFamily: "'Fraunces', Georgia, serif" }}
          >
            Ready to see it in motion?
          </h3>
          <p className="max-w-md text-sm text-slate-500">
            10-minute walkthrough · no signup required. Or grab the 14-day Pro trial.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
            >
              Open the live demo
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href="mailto:sales@siteproof.dev"
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </motion.section>
    </motion.div>
  );
}

function TierCard({ tier }: { tier: Tier }) {
  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl border bg-white p-5 ${
        tier.highlight
          ? 'border-emerald-300 shadow-lg ring-1 ring-emerald-200'
          : 'border-slate-200'
      }`}
    >
      {tier.highlight && (
        <div className="absolute right-0 top-0 rounded-bl-lg bg-emerald-600 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-white">
          Most popular
        </div>
      )}
      <header>
        <h3 className="text-lg font-semibold text-slate-900">{tier.name}</h3>
        <p className="mt-1 text-[12px] text-slate-500">{tier.blurb}</p>
      </header>
      <div className="mt-4">
        <p
          className="text-3xl font-medium text-slate-900"
          style={{ fontFamily: "'Fraunces', Georgia, serif" }}
        >
          {tier.priceMonthly}
        </p>
        <p className="text-[11px] text-slate-500">{tier.priceCaption}</p>
      </div>
      <ul className="mt-4 flex-1 space-y-1.5">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-1.5 text-[12px] text-slate-700">
            <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-600" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5">
        <Link
          to={tier.ctaHref}
          className={`inline-flex w-full items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-medium transition-colors ${
            tier.highlight
              ? 'bg-slate-900 text-white hover:bg-emerald-700'
              : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {tier.cta}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}
