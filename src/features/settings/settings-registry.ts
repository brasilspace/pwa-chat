/**
 * settings-registry — Settings-Sektionen zentral registriert.
 *
 * Drei Cluster:
 *   - user      → fuer jeden Benutzer sichtbar (Profil, Darstellung, ...)
 *   - workspace → nur fuer Admins (Workspace-Branding, System, Sichtbarkeit, ...)
 *   - module    → dynamisch je nach aktivem Modul (Kaskaden-Settings, ...)
 *
 * Reihenfolge in der Sidebar = Reihenfolge im Array. Module-Sektionen
 * erscheinen nur wenn das jeweilige Modul aktiv ist (Bootstrap-Response).
 * Workspace-Sektionen verschwinden automatisch fuer Nicht-Admins.
 */

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    User, MessageSquare, Lock,
    Building2, Server, Shield, Eye, LayoutGrid, CreditCard, ShoppingBag,
    GitBranch, BookOpen, Users, Activity, FileType, Clock, Star, Mail,
    Headphones, Anchor, Printer, ReceiptText, HardDrive, Globe, ListPlus, Bell,
} from 'lucide-react';

import { ProfileSection } from './sections/profile-section';
import { ChatDesignSection } from './sections/chat-design-section';
import { SecuritySection } from './sections/security-section';
import { WorkspaceGeneralSection } from './sections/workspace-general-section';
import { MembersSection } from './sections/members-section';
import { SystemSection } from './sections/system-section';
import { VisibilitySection } from './sections/visibility-section';
import { AppsSection } from './sections/apps-section';
import { PluginsSection } from './sections/plugins-section';
import { BillingSection } from './sections/billing-section';
import { WorkspaceSecuritySection } from './sections/workspace-security-section';
import { CascadeSection } from './sections/cascade-section';
import { ConceptSection } from './sections/concept-section';
import { SystemHealthSection } from './sections/system-health-section';
import { DocumentTypesSettings } from '@/features/dms/document-types-settings';
import { CustomFieldsSection } from './sections/custom-fields-section';
import { NotificationSection } from './sections/notification-section';
import { NotificationPolicySection } from './sections/notification-policy-section';
import { SerienbriefSection } from './sections/serienbrief-section';
import { RetentionSettings } from '@/features/dms/retention-settings';
import { DmsTemplatesSettings } from '@/features/dms/dms-templates-settings';
import { DmsEmailAliasSettings } from '@/features/dms/dms-email-alias-settings';
import { HelpSection } from './sections/help-section';
import { TasksReedeSection } from './sections/tasks-reede-section';
import { PrintersSection } from './sections/printers-section';
import { BillingProfileSection } from './sections/billing-profile-section';
import { DriveDevicesSection } from './sections/drive-devices-section';
import { LanguageSection } from './sections/language-section';
import { LanguageOverridesSection } from './sections/language-overrides-section';
import { UpdateSwitchSection } from './sections/update-switch-section';
import { DpoConsoleSection } from './sections/dpo-console-section';

export type SettingsCluster = 'user' | 'workspace' | 'module';

export interface SettingsSection {
    /** URL-Slug, eindeutig. Erscheint als /settings/<key> */
    key: string;
    cluster: SettingsCluster;
    label: string;
    icon: LucideIcon;
    component: ComponentType;
    /** Nur sichtbar wenn User Admin oder SUPERADMIN ist */
    requiresAdmin?: boolean;
    /** Nur sichtbar wenn deployment_mode = 'cloud' (z.B. Stripe-Rechnungen) */
    requiresCloud?: boolean;
    /** Nur sichtbar wenn dieses Modul aktiv ist (manifest.featureFlag) */
    requiresModule?: string;
}

export const CLUSTER_LABELS: Record<SettingsCluster, string> = {
    user: 'Persönlich',
    workspace: 'Workspace',
    module: 'Apps',
};

export const CLUSTER_ORDER: SettingsCluster[] = ['user', 'workspace', 'module'];

export const SETTINGS_SECTIONS: SettingsSection[] = [
    // ───────────────── Persönlich (alle User) ─────────────────
    { key: 'profil',      cluster: 'user', label: 'Profil',      icon: User,              component: ProfileSection },
    { key: 'sprache',     cluster: 'user', label: 'Sprache',     icon: Globe,             component: LanguageSection },
    { key: 'chat-design', cluster: 'user', label: 'Chat-Design', icon: MessageSquare,     component: ChatDesignSection },
    { key: 'hilfe',       cluster: 'user', label: 'Hilfe & Tipps', icon: Headphones,      component: HelpSection },
    { key: 'sicherheit',  cluster: 'user', label: 'Sicherheit',  icon: Lock,              component: SecuritySection },
    { key: 'benachrichtigungen', cluster: 'user', label: 'Benachrichtigungen', icon: Bell, component: NotificationSection },
    { key: 'meine-geraete', cluster: 'user', label: 'Meine Geraete', icon: HardDrive,     component: DriveDevicesSection },
    { key: 'dms-email',   cluster: 'user', label: 'Mein Fach Email', icon: Mail,          requiresModule: 'personal-fach', component: DmsEmailAliasSettings },

    // ───────────────── Workspace (Admin-only) ─────────────────
    { key: 'workspace-allgemein',  cluster: 'workspace', label: 'Allgemein',    icon: Building2,  requiresAdmin: true,                       component: WorkspaceGeneralSection },
    { key: 'mitglieder',           cluster: 'workspace', label: 'Mitglieder',   icon: Users,      requiresAdmin: true,                       component: MembersSection },
    { key: 'system',               cluster: 'workspace', label: 'System',       icon: Server,     requiresAdmin: true,                       component: SystemSection },
    { key: 'sichtbarkeit',         cluster: 'workspace', label: 'Sichtbarkeit', icon: Eye,        requiresAdmin: true,                       component: VisibilitySection },
    { key: 'apps',                 cluster: 'workspace', label: 'Apps',         icon: LayoutGrid, requiresAdmin: true,                       component: AppsSection },
    { key: 'plugins',              cluster: 'workspace', label: 'Plugin-Store', icon: ShoppingBag,requiresAdmin: true,                       component: PluginsSection },
    { key: 'rechnungen',           cluster: 'workspace', label: 'Rechnungen',   icon: CreditCard, requiresAdmin: true, requiresCloud: true,  component: BillingSection },
    { key: 'rechnungsadresse',     cluster: 'workspace', label: 'Rechnungsadresse', icon: ReceiptText, requiresAdmin: true,                 component: BillingProfileSection },
    { key: 'workspace-sicherheit', cluster: 'workspace', label: 'Sicherheit',   icon: Shield,     requiresAdmin: true,                       component: WorkspaceSecuritySection },
    { key: 'datenschutz',          cluster: 'workspace', label: 'Datenschutz (DSB)', icon: Shield, requiresAdmin: true,                       component: DpoConsoleSection },
    { key: 'updates',              cluster: 'workspace', label: 'Updates',      icon: GitBranch,  requiresAdmin: true,                       component: UpdateSwitchSection },
    { key: 'benachrichtigungen-policy', cluster: 'workspace', label: 'Benachrichtigungen', icon: Bell, requiresAdmin: true,                component: NotificationPolicySection },
    { key: 'sprach-overrides',     cluster: 'workspace', label: 'Sprache (Begriffe)', icon: Globe, requiresAdmin: true,                       component: LanguageOverridesSection },
    { key: 'tasks-reede',          cluster: 'workspace', label: 'Aufgaben-Pflege', icon: Anchor,  requiresAdmin: true,                       component: TasksReedeSection },
    { key: 'printers',             cluster: 'workspace', label: 'Drucker',         icon: Printer, requiresAdmin: true,                       component: PrintersSection },
    { key: 'custom-fields',        cluster: 'workspace', label: 'Eigene Felder',  icon: ListPlus, requiresAdmin: true,                       component: CustomFieldsSection },
    { key: 'serienbrief',          cluster: 'workspace', label: 'Serienbrief',    icon: Mail,     requiresAdmin: true, requiresModule: 'serienbrief', component: SerienbriefSection },
    { key: 'dms-types',            cluster: 'workspace', label: 'Dokument-Typen', icon: FileType, requiresAdmin: true, requiresModule: 'personal-fach', component: DocumentTypesSettings },
    { key: 'dms-retention',        cluster: 'workspace', label: 'Aufbewahrung',   icon: Clock,    requiresAdmin: true, requiresModule: 'personal-fach', component: RetentionSettings },
    { key: 'dms-templates',        cluster: 'workspace', label: 'Vorlagen',       icon: Star,     requiresAdmin: true, requiresModule: 'personal-fach', component: DmsTemplatesSettings },

    // ───────────────── Module (dynamisch, Admin-only) ─────────────────
    { key: 'system-health', cluster: 'module', label: 'System-Gesundheit', icon: Activity,  requiresAdmin: true, requiresModule: 'system-health',     component: SystemHealthSection },
    { key: 'kaskaden',      cluster: 'module', label: 'Flow-Designer',     icon: GitBranch, requiresAdmin: true, requiresModule: 'cascade',           component: CascadeSection },
    { key: 'konzepte',      cluster: 'module', label: 'Konzepte',          icon: BookOpen,  requiresAdmin: true, requiresModule: 'concept-framework', component: ConceptSection },
];
