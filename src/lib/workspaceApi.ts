export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  snippet: string;
}

export interface TaskListSummary {
  id: string;
  title: string;
}

export interface TaskItemSummary {
  id: string;
  title: string;
  status: string;
  due?: string;
}

export interface ChatSpaceSummary {
  name: string;
  displayName?: string;
  spaceType?: string;
}

async function googleFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: init?.signal || controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg =
        (data as { error?: { message?: string } })?.error?.message ||
        `Google Workspace API error (${res.status})`;
      throw new Error(errMsg);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Google Workspace request timed out after 30s.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listDriveFiles(token: string, query = ''): Promise<DriveFileItem[]> {
  const qParam = query ? `&q=${encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}' and trashed = false`)}` : '&q=trashed%20%3D%20false';
  const data = await googleFetch<{ files?: DriveFileItem[] }>(
    `https://www.googleapis.com/drive/v3/files?pageSize=15&fields=files(id,name,mimeType,modifiedTime,webViewLink)${qParam}`,
    token
  );
  return data.files || [];
}

export async function exportProjectBackupToDrive(
  token: string,
  projectName: string,
  payloadJson: string
): Promise<DriveFileItem> {
  const metadata = {
    name: `${projectName.replace(/[^a-zA-Z0-9_-]/g, '_')}-acs-backup.json`,
    mimeType: 'application/json',
  };
  const boundary = `acs_boundary_${Date.now()}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${payloadJson}\r\n--${boundary}--`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Drive upload failed');
    }
    return data as DriveFileItem;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Google Drive backup upload timed out after 30s.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function listRecentGmailMessages(token: string): Promise<GmailMessageSummary[]> {
  const list = await googleFetch<{ messages?: Array<{ id: string }> }>(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6',
    token
  );
  const items = list.messages || [];
  const results: GmailMessageSummary[] = [];

  for (const item of items.slice(0, 6)) {
    const detail = await googleFetch<{
      id: string;
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      token
    );
    const headers = detail.payload?.headers || [];
    const subject = headers.find((h) => h.name === 'Subject')?.value || '(No Subject)';
    const from = headers.find((h) => h.name === 'From')?.value || 'Unknown';
    results.push({
      id: detail.id,
      subject,
      from,
      snippet: detail.snippet || '',
    });
  }
  return results;
}

export async function createGmailDraft(
  token: string,
  to: string,
  subject: string,
  bodyText: string
): Promise<{ id: string }> {
  const mime = [`To: ${to}`, `Subject: ${subject}`, 'Content-Type: text/plain; charset=utf-8', '', bodyText].join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return googleFetch<{ id: string }>('https://gmail.googleapis.com/gmail/v1/users/me/drafts', token, {
    method: 'POST',
    body: JSON.stringify({ message: { raw: encoded } }),
  });
}

export async function exportAuditToGoogleSheet(
  token: string,
  title: string,
  rows: string[][]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  const created = await googleFetch<{
    spreadsheetId: string;
    spreadsheetUrl: string;
    sheets?: Array<{ properties?: { title?: string } }>;
  }>('https://sheets.googleapis.com/v4/spreadsheets', token, {
    method: 'POST',
    body: JSON.stringify({ properties: { title } }),
  });

  const firstSheetTitle = created.sheets?.[0]?.properties?.title || 'Sheet1';
  const range = encodeURIComponent(`'${firstSheetTitle}'!A1`);
  await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(created.spreadsheetId)}/values/${range}?valueInputOption=USER_ENTERED`,
    token,
    {
      method: 'PUT',
      body: JSON.stringify({ values: rows }),
    }
  );

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl,
  };
}

export async function listGoogleTaskLists(token: string): Promise<TaskListSummary[]> {
  const data = await googleFetch<{ items?: TaskListSummary[] }>(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    token
  );
  return data.items || [];
}

export async function listGoogleTasks(token: string, taskListId = '@default'): Promise<TaskItemSummary[]> {
  const data = await googleFetch<{ items?: TaskItemSummary[] }>(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?maxResults=20`,
    token
  );
  return data.items || [];
}

export async function createGoogleTask(
  token: string,
  title: string,
  notes: string,
  taskListId = '@default'
): Promise<TaskItemSummary> {
  return googleFetch<TaskItemSummary>(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ title, notes }),
    }
  );
}

export async function createGoogleSlidesSummary(
  token: string,
  title: string
): Promise<{ presentationId: string; presentationUrl: string }> {
  const created = await googleFetch<{ presentationId: string }>(
    'https://slides.googleapis.com/v1/presentations',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ title }),
    }
  );
  return {
    presentationId: created.presentationId,
    presentationUrl: `https://docs.google.com/presentation/d/${created.presentationId}/edit`,
  };
}

export async function inspectGoogleForm(token: string, formId: string) {
  const safeId = encodeURIComponent(formId.trim());
  const form = await googleFetch<{ info?: { title?: string; description?: string }; items?: unknown[] }>(
    `https://forms.googleapis.com/v1/forms/${safeId}`,
    token
  );
  const responses = await googleFetch<{ responses?: unknown[] }>(
    `https://forms.googleapis.com/v1/forms/${safeId}/responses`,
    token
  ).catch(() => ({ responses: [] }));

  return {
    title: form.info?.title || 'Untitled Form',
    description: form.info?.description || '',
    questionCount: form.items?.length || 0,
    responseCount: responses.responses?.length || 0,
  };
}

export async function listGoogleChatSpaces(token: string): Promise<ChatSpaceSummary[]> {
  const data = await googleFetch<{ spaces?: ChatSpaceSummary[] }>(
    'https://chat.googleapis.com/v1/spaces',
    token
  );
  return data.spaces || [];
}

export async function sendGoogleChatMessage(
  token: string,
  spaceName: string,
  text: string
): Promise<unknown> {
  return googleFetch(
    `https://chat.googleapis.com/v1/${spaceName}/messages`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ text }),
    }
  );
}
