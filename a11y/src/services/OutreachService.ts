import type { Finding, OutreachDraft } from '../core/Types.js';
import { composeOutreach, looksLikeOptOut } from '../pipeline/Outreach.js';
import { isReportable, selectMiniFindings } from '../reports/Selection.js';
import { buildEvidencePack, packQuality } from '../evidence/EvidencePack.js';
import type { Platform } from './Platform.js';

export interface DraftOptions {
  senderName?: string;
  senderCompany?: string;
  reportLink?: string | null;
  channel?: OutreachDraft['channel'];
}

/**
 * SYSTEM 14 — outreach with a human gate.
 *
 * Drafting is refused rather than degraded: no contact path, no evidence strong
 * enough to show, or a suppressed domain all stop the draft. Nothing is ever
 * sent by this service; it produces drafts for a person to approve.
 */
export class OutreachService {
  constructor(private readonly platform: Platform) {}

  draft(prospectId: string, options: DraftOptions = {}): OutreachDraft {
    const { store, audits, storage } = this.platform;
    const prospect = store.getProspect(prospectId);
    if (!prospect) throw new Error(`Unknown prospect: ${prospectId}`);
    if (store.isSuppressed('domain', prospect.domain)) {
      throw new Error(`${prospect.domain} is on the suppression list — no outreach may be drafted.`);
    }

    const contact = prospect.contactChannels.find((c) => c.kind === 'email') ?? prospect.contactChannels[0] ?? null;
    if (contact && contact.kind === 'email' && store.isSuppressed('email', contact.value)) {
      throw new Error(`${contact.value} is on the suppression list — no outreach may be drafted.`);
    }

    const scan = audits.latestCompletedScan(prospectId);
    if (!scan) throw new Error('No completed scan to base outreach on.');
    const findings = audits.listFindings(scan.id);
    const groups = audits.listGroups(scan.id);

    // Only findings a reviewer approved, or that an engine confirmed outright.
    const usable = selectMiniFindings(findings.filter(isReportable), groups, 4);
    const strong = usable.filter((finding) => {
      const pack = buildEvidencePack(finding, { storage, inlineImages: false });
      return packQuality(pack).score >= 60;
    });
    if (strong.length === 0) {
      throw new Error('No finding has evidence strong enough to lead with. Review the findings or re-scan before contacting this prospect.');
    }

    const composition = composeOutreach(prospect, strong, {
      senderName: options.senderName ?? process.env.A11Y_SENDER_NAME ?? 'Jonatan',
      senderCompany: options.senderCompany ?? process.env.A11Y_SENDER_COMPANY ?? 'Tillgänglighetsteamet',
      reportLink: options.reportLink ?? null,
    });

    const draft = store.createOutreachDraft({
      prospectId,
      channel: options.channel ?? (contact?.kind === 'email' ? 'email' : contact?.kind === 'contact_form' ? 'contact_form' : 'email'),
      toValue: contact?.value ?? null,
      subject: composition.subject,
      body: composition.body,
      citedFindingIds: composition.citedFindingIds,
    });

    store.setProspectFacts(prospectId, { outreachStatus: 'drafted' });
    store.addTimelineEvent(prospectId, 'outreach_drafted', `Outreach drafted citing ${composition.citedFindingIds.length} finding(s)`, {
      draftId: draft.id,
      citedFindingIds: composition.citedFindingIds,
    });
    return draft;
  }

  approve(draftId: string, reviewer: string, note?: string): OutreachDraft {
    const draft = this.platform.store.getOutreachDraft(draftId);
    if (!draft) throw new Error(`Unknown draft: ${draftId}`);
    const updated = this.platform.store.setOutreachStatus(draftId, 'approved', note)!;
    this.platform.store.setProspectFacts(draft.prospectId, { outreachStatus: 'approved' });
    this.platform.store.addTimelineEvent(draft.prospectId, 'outreach_approved', `${reviewer} approved the outreach draft`, { draftId, note: note ?? null });
    return updated;
  }

  reject(draftId: string, reviewer: string, note?: string): OutreachDraft {
    const draft = this.platform.store.getOutreachDraft(draftId);
    if (!draft) throw new Error(`Unknown draft: ${draftId}`);
    const updated = this.platform.store.setOutreachStatus(draftId, 'rejected', note)!;
    this.platform.store.setProspectFacts(draft.prospectId, { outreachStatus: 'none' });
    this.platform.store.addTimelineEvent(draft.prospectId, 'review_decision', `${reviewer} rejected the outreach draft`, { draftId, note: note ?? null });
    return updated;
  }

  /**
   * Records that an approved draft was sent. The platform does not send mail
   * itself — a person does, deliberately, from their own mailbox.
   */
  markSent(draftId: string): OutreachDraft {
    const draft = this.platform.store.getOutreachDraft(draftId);
    if (!draft) throw new Error(`Unknown draft: ${draftId}`);
    if (draft.status !== 'approved') throw new Error('Only an approved draft can be marked as sent.');
    const updated = this.platform.store.setOutreachStatus(draftId, 'sent')!;
    this.platform.store.setProspectFacts(draft.prospectId, { outreachStatus: 'sent' });
    this.platform.store.setStage(draft.prospectId, 'CONTACTED', 'Follow up in five working days if there is no reply.');
    this.platform.store.addTimelineEvent(draft.prospectId, 'outreach_sent', `Outreach sent to ${draft.toValue ?? 'unknown recipient'}`, { draftId });
    return updated;
  }

  /** Inbound reply handling, including opt-out honouring. */
  recordReply(prospectId: string, replyText: string, contactValue?: string): { optedOut: boolean } {
    const { store } = this.platform;
    const prospect = store.getProspect(prospectId);
    if (!prospect) throw new Error(`Unknown prospect: ${prospectId}`);

    if (looksLikeOptOut(replyText)) {
      store.addSuppression('domain', prospect.domain, 'Recipient asked not to be contacted');
      if (contactValue) store.addSuppression('email', contactValue, 'Recipient asked not to be contacted');
      store.setProspectFacts(prospectId, { outreachStatus: 'suppressed' });
      store.setStage(prospectId, 'LOST', 'Opted out — do not contact again.', 'Opt-out received');
      store.addTimelineEvent(prospectId, 'stage_changed', 'Opt-out received; prospect suppressed', { replyExcerpt: replyText.slice(0, 200) });
      return { optedOut: true };
    }

    store.setProspectFacts(prospectId, { outreachStatus: 'replied' });
    store.setStage(prospectId, 'REPLIED', 'Offer a 30-minute walkthrough of the findings.');
    return { optedOut: false };
  }

  queue(status: OutreachDraft['status'] = 'drafted'): OutreachDraft[] {
    return this.platform.store.listOutreachDrafts({ status });
  }

  citedFindings(draft: OutreachDraft): Finding[] {
    return draft.citedFindingIds.map((id) => this.platform.audits.getFinding(id)).filter((f): f is Finding => Boolean(f));
  }
}
