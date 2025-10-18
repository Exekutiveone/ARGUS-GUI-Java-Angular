import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType, HttpHeaders } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface DbOption {
  id: string;
  label: string;
}

interface ToastMessage {
  id: number;
  message: string;
  type: 'ok' | 'error';
}

interface TableRow {
  [key: string]: unknown;
}

interface TransferState {
  loaded: number;
  total: number;
  inFlight: boolean;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  readonly title = 'DB Web GUI';
  readonly defaultOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  private readonly storageKey = 'dbwebgui.baseUrl';

  baseUrl = this.defaultOrigin;
  baseUrlInput = this.baseUrl;

  readonly databases: DbOption[] = [
    { id: 'dbLocal', label: 'DB Local - (SQLite)' },
    { id: 'db_pi', label: 'DB Pi - MariaDB (192.168.178.144)' },
    { id: 'on_prem_serv', label: 'On-Prem Server (on_prem_serv)' }
  ];

  selectedDb = this.databases[0]?.id ?? '';
  relocate = { from: this.selectedDb, to: this.selectedDb };

  filterText = '';
  fileToUpload: File | null = null;

  upload: TransferState = { loaded: 0, total: 0, inFlight: false };
  download: TransferState = { loaded: 0, total: 0, inFlight: false };

  opsInfo = '';
  clearInfo = '';
  stats = '0 Zeilen · 0 Spalten';
  tableColumns: string[] = [];
  tableData: TableRow[] = [];
  schemaOutput = 'Not loaded yet.';
  schemaPreview = 'No data preview yet.';
  private lastData: TableRow[] = [];

  toasts: ToastMessage[] = [];
  private toastId = 0;

  private readonly endpoints = {
    upload: (db: string) => `/api/db/${db}/upload`,
    download: (db: string) => `/api/db/${db}/download`,
    relocate: (from: string, to: string) => `/api/admin/relocate?from=${from}&to=${to}`,
    sync: (db: string) => `/api/admin/sync?db=${db}`,
    data: (db: string, params?: { filter?: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.filter) {
        searchParams.set('filter', params.filter);
      }
      if (params?.limit) {
        searchParams.set('limit', String(params.limit));
      }
      const suffix = searchParams.toString();
      return `/api/db/${db}/data${suffix ? `?${suffix}` : ''}`;
    },
    schema: (db: string) => `/api/db/${db}/schema`,
    clear: (db: string) => `/api/db/${db}/clear`,
    clearAll: '/api/db/clear-all'
  };

  constructor(private readonly http: HttpClient) {
    this.baseUrl = this.loadBaseUrl();
    this.baseUrlInput = this.baseUrl;
    this.relocate = { from: this.selectedDb, to: this.selectedDb };
  }

  ngOnInit(): void {
    this.updateTable([]);
    if (
      this.baseUrl &&
      this.defaultOrigin &&
      this.normalizedOrigin(this.baseUrl) !== this.normalizedOrigin(this.defaultOrigin)
    ) {
      this.showToast('Hinweis: CORS im Backend freischalten (Origin erlauben)');
    }
  }

  get uploadWidth(): string {
    return this.computeProgressWidth(this.upload);
  }

  get downloadWidth(): string {
    return this.computeProgressWidth(this.download);
  }

  get uploadInfo(): string {
    return this.formatProgressInfo(this.upload);
  }

  get downloadInfo(): string {
    return this.formatProgressInfo(this.download);
  }

  handleDbChange(): void {
    this.selectedDb = this.selectedDb || this.databases[0]?.id || '';
  }

  saveBaseUrl(): void {
    const trimmed = this.baseUrlInput.trim();
    const newValue = trimmed.length ? trimmed : this.defaultOrigin;
    this.baseUrl = newValue;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(this.storageKey, newValue);
    }
    this.showToast('Base URL gespeichert');
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.fileToUpload = input.files?.[0] ?? null;
  }

  upload(): void {
    if (!this.fileToUpload) {
      this.showToast('Bitte Datei auswählen', false);
      return;
    }

    const formData = new FormData();
    formData.append('file', this.fileToUpload);

    this.upload = { loaded: 0, total: this.fileToUpload.size, inFlight: true };

    this.http
      .post(this.resolveUrl(this.endpoints.upload(this.selectedDb)), formData, {
        observe: 'events',
        reportProgress: true,
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            this.upload.loaded = event.loaded ?? 0;
            this.upload.total = event.total ?? this.fileToUpload?.size ?? 0;
          }
          if (event.type === HttpEventType.Response) {
            this.showToast('Upload erfolgreich');
            this.resetUpload();
          }
        },
        error: () => {
          this.showToast('Upload fehlgeschlagen', false);
          this.resetUpload();
        }
      });
  }

  download(): void {
    this.download = { loaded: 0, total: 0, inFlight: true };

    this.http
      .get(this.resolveUrl(this.endpoints.download(this.selectedDb)), {
        observe: 'events',
        reportProgress: true,
        responseType: 'blob' as const,
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.DownloadProgress) {
            this.download.loaded = event.loaded ?? 0;
            this.download.total = event.total ?? 0;
          }
          if (event.type === HttpEventType.Response) {
            const blob = event.body;
            if (blob) {
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = `export-${this.selectedDb}.bin`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              setTimeout(() => URL.revokeObjectURL(link.href), 1500);
              this.showToast('Download bereit');
            }
            this.resetDownload();
          }
        },
        error: () => {
          this.showToast('Download fehlgeschlagen', false);
          this.resetDownload();
        }
      });
  }

  relocateData(): void {
    if (this.relocate.from === this.relocate.to) {
      this.showToast('Quelle und Ziel müssen unterschiedlich sein', false);
      return;
    }

    this.http
      .post(this.resolveUrl(this.endpoints.relocate(this.relocate.from, this.relocate.to)), null, {
        responseType: 'text',
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (message) => {
          this.opsInfo = `Relocate: ${message}`;
          this.showToast('Relocate OK');
        },
        error: (error) => {
          this.opsInfo = 'Relocate fehlgeschlagen';
          this.handleHttpError('Relocate Fehler', error);
        }
      });
  }

  sync(): void {
    this.http
      .post(this.resolveUrl(this.endpoints.sync(this.selectedDb)), null, {
        responseType: 'text',
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (message) => {
          this.opsInfo = `Sync: ${message}`;
          this.showToast('Sync OK');
        },
        error: (error) => {
          this.opsInfo = 'Sync fehlgeschlagen';
          this.handleHttpError('Sync Fehler', error);
        }
      });
  }

  loadData(): void {
    const filter = this.filterText.trim();

    this.http
      .get<TableRow[]>(this.resolveUrl(this.endpoints.data(this.selectedDb, { filter: filter || undefined })), {
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (rows) => {
          this.lastData = Array.isArray(rows) ? rows : [];
          this.updateTable(this.lastData);
          this.schemaPreview = this.buildPreview(this.lastData);
          this.showToast('Daten geladen');
        },
        error: (error) => {
          this.handleHttpError('Fehler beim Laden der Daten', error);
        }
      });
  }

  loadSchema(): void {
    this.schemaOutput = 'Schema wird geladen...';
    this.http
      .get<unknown>(this.resolveUrl(this.endpoints.schema(this.selectedDb)), {
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (schema) => {
          this.schemaOutput = this.formatSchema(schema);
          this.loadSchemaPreview();
          this.showToast('Schema geladen');
        },
        error: (error) => {
          this.schemaOutput = 'Schema konnte nicht geladen werden.';
          this.schemaPreview = 'No data preview yet.';
          this.handleHttpError('Fehler beim Laden des Schemas', error);
        }
      });
  }

  exportCsv(): void {
    if (!this.lastData.length) {
      this.showToast('Keine Daten zum Export', false);
      return;
    }

    const columns = Array.from(new Set(this.lastData.flatMap((row) => Object.keys(row))));
    const lines = [columns.join(',')];
    for (const row of this.lastData) {
      const line = columns.map((key) => JSON.stringify((row as TableRow)[key] ?? '')).join(',');
      lines.push(line);
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'export.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1500);
    this.showToast('CSV erstellt');
  }

  clearSelected(): void {
    if (!this.confirmAction(`Alle Telemetriedaten in "${this.selectedDb}" löschen?`)) {
      return;
    }

    this.http
      .post<Record<string, unknown> | null>(this.resolveUrl(this.endpoints.clear(this.selectedDb)), null, {
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (payload) => {
          const rowsDeleted = (payload?.['rowsDeleted'] as number) ?? 0;
          const target = (payload?.['target'] as string) ?? this.selectedDb;
          this.clearInfo = `Cleared ${rowsDeleted} rows in ${target}`;
          this.lastData = [];
          this.updateTable([]);
          this.schemaPreview = this.buildPreview([]);
          this.showToast('Telemetriedaten gelöscht');
        },
        error: (error) => {
          this.clearInfo = 'Löschen fehlgeschlagen.';
          this.handleHttpError('Fehler beim Löschen', error);
        }
      });
  }

  clearAll(): void {
    if (!this.confirmAction('Wirklich alle Telemetriedaten in allen Datenbanken löschen?')) {
      return;
    }

    this.http
      .post<Record<string, number> | { targets?: Record<string, number> } | null>(
        this.resolveUrl(this.endpoints.clearAll),
        null,
        { headers: this.buildHeaders() }
      )
      .subscribe({
        next: (payload) => {
          const parts =
            payload && typeof payload === 'object' && 'targets' in payload && payload.targets
              ? Object.entries(payload.targets as Record<string, number>)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(', ')
              : '';
          this.clearInfo = parts ? `Cleared telemetry rows -> ${parts}` : 'Alle Telemetriedaten gelöscht';
          this.lastData = [];
          this.updateTable([]);
          this.schemaPreview = this.buildPreview([]);
          this.showToast('Alle Telemetriedaten gelöscht');
        },
        error: (error) => {
          this.clearInfo = 'Löschen aller Daten fehlgeschlagen.';
          this.handleHttpError('Fehler beim Löschen (alle)', error);
        }
      });
  }

  private loadBaseUrl(): string {
    if (typeof window === 'undefined') {
      return this.defaultOrigin;
    }
    const stored = window.localStorage.getItem(this.storageKey)?.trim();
    return stored?.length ? stored : this.defaultOrigin;
  }

  private resolveUrl(path: string): string {
    const base = this.baseUrl?.trim().length ? this.baseUrl : this.defaultOrigin;
    try {
      return new URL(path, base || 'http://localhost').toString();
    } catch {
      return `${base}${path}`;
    }
  }

  private buildHeaders(extra: Record<string, string> = {}): HttpHeaders {
    return new HttpHeaders(extra);
  }

  private updateTable(rows: TableRow[]): void {
    if (!rows.length) {
      this.tableColumns = [];
      this.tableData = [];
      this.stats = '0 Zeilen · 0 Spalten';
      return;
    }

    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    this.tableColumns = columns;
    this.tableData = rows;
    this.stats = `${rows.length} Zeilen · ${columns.length} Spalten`;
  }

  private buildPreview(rows: TableRow[]): string {
    if (!rows.length) {
      return 'Keine Daten vorhanden.';
    }

    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    if (!columns.length) {
      return 'Keine Spalten gefunden.';
    }

    const header = columns.join(' | ');
    const lines = rows.slice(0, 5).map((row) => columns.map((col) => String((row as TableRow)[col] ?? '')).join(' | '));
    return [header, ...lines].join('\n');
  }

  private loadSchemaPreview(): void {
    this.http
      .get<TableRow[]>(this.resolveUrl(this.endpoints.data(this.selectedDb, { limit: 5 })), {
        headers: this.buildHeaders()
      })
      .subscribe({
        next: (preview) => {
          this.schemaPreview = this.buildPreview(Array.isArray(preview) ? preview : []);
        },
        error: () => {
          this.schemaPreview = this.buildPreview([]);
        }
      });
  }

  private formatSchema(schema: unknown): string {
    if (!Array.isArray(schema) || !schema.length) {
      return 'Kein Schema gefunden.';
    }

    const lines: string[] = [];
    for (const entry of schema as Array<Record<string, unknown>>) {
      const tableName = (entry['table'] as string) ?? (entry['name'] as string) ?? 'telemetry';
      lines.push(`Tabelle: ${tableName}`);

      const columns = Array.isArray(entry['columns']) ? (entry['columns'] as Array<Record<string, unknown>>) : [];
      if (!columns.length && entry['name'] && entry['type']) {
        lines.push(`  - ${entry['name']} ${entry['type']}`);
      }

      for (const column of columns) {
        const colName = (column['name'] as string) ?? '(ohne Name)';
        const type = column['type'] ? ` ${column['type']}` : '';
        const notNull =
          Number(column['notnull']) === 1 || column['is_nullable'] === 'NO' ? ' NOT NULL' : '';
        const primaryKey = Number(column['pk']) === 1 ? ' PRIMARY KEY' : '';
        const defaultValue =
          column['dflt_value'] !== null && column['dflt_value'] !== undefined && column['dflt_value'] !== ''
            ? ` DEFAULT ${column['dflt_value']}`
            : '';
        lines.push(`  - ${colName}${type}${notNull}${primaryKey}${defaultValue}`);
      }

      const ddl = (entry['createSql'] as string) ?? (entry['sql'] as string) ?? '';
      if (ddl) {
        lines.push(`  SQL: ${ddl}`);
      }

      lines.push('');
    }

    return lines.join('\n').trim();
  }

  private showToast(message: string, ok = true): void {
    const toast: ToastMessage = { id: ++this.toastId, message, type: ok ? 'ok' : 'error' };
    this.toasts = [...this.toasts, toast];
    setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== toast.id);
    }, 2500);
  }

  private resetUpload(): void {
    this.upload = { loaded: 0, total: 0, inFlight: false };
    this.fileToUpload = null;
  }

  private resetDownload(): void {
    this.download = { loaded: 0, total: 0, inFlight: false };
  }

  private computeProgressWidth(state: TransferState): string {
    if (!state.inFlight) {
      return '0%';
    }
    const percent = state.total > 0 ? Math.round((state.loaded / state.total) * 100) : 0;
    const min = state.loaded > 0 || percent > 0 ? Math.max(percent, 5) : 5;
    return `${Math.min(min, 100)}%`;
  }

  private formatProgressInfo(state: TransferState): string {
    if (!state.inFlight && state.loaded === 0) {
      return '0%';
    }
    if (state.total > 0) {
      const percent = Math.round((state.loaded / state.total) * 100);
      return `${percent}% (${this.formatBytes(state.loaded)} / ${this.formatBytes(state.total)})`;
    }
    if (state.loaded > 0) {
      return `${this.formatBytes(state.loaded)} geladen`;
    }
    return '0%';
  }

  private formatBytes(value: number): string {
    if (!value) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
    const size = value / Math.pow(1024, index);
    return `${size.toFixed(1)} ${units[index]}`;
  }

  private confirmAction(message: string): boolean {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return true;
    }
    return window.confirm(message);
  }

  private handleHttpError(message: string, error: unknown, showToast = true): void {
    if (showToast) {
      this.showToast(message, false);
    }
    console.error(message, error);
  }

  private normalizedOrigin(url: string): string {
    try {
      return new URL(url).origin;
    } catch {
      return url;
    }
  }
}
