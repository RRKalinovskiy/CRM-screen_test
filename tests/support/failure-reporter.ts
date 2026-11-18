import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

const ANSI = /\u001b\[[0-9;]*m/g;

type Failure = {
  test: TestCase;
  result: TestResult;
  logs: string;
};

function clean(value: string | undefined, limit: number): string {
  const text = (value ?? '').replace(ANSI, '').trim();
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text;
}

function codeBlock(value: string): string[] {
  if (!value) return [];
  // ~~~ вместо ```: в ошибках и локаторах часто встречаются обратные кавычки.
  return ['~~~text', value, '~~~'];
}

/**
 * Компактный отчёт об упавших тестах для GitHub Actions.
 *
 * Пишет Markdown в:
 * - stdout job'а;
 * - test-results/failure-summary.md (артефакт);
 * - GITHUB_STEP_SUMMARY (сводка запуска в интерфейсе GitHub).
 */
export default class FailureReporter implements Reporter {
  private readonly startedAt = Date.now();
  private readonly logs = new Map<string, string>();
  private readonly failures = new Map<string, Failure>();

  onStdOut(chunk: string | Buffer, test?: TestCase, result?: TestResult): void {
    this.appendOutput(chunk, test, result);
  }

  onStdErr(chunk: string | Buffer, test?: TestCase, result?: TestResult): void {
    this.appendOutput(chunk, test, result);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const key = `${test.id}:${result.retry}`;
    const logs = this.logs.get(key) ?? '';
    this.logs.delete(key);

    if (result.status === 'failed' || result.status === 'timedOut' || result.status === 'interrupted') {
      this.failures.set(test.id, { test, result, logs });
    } else if (result.status === 'passed') {
      // Тест упал на предыдущей попытке, но прошёл на retry — не считаем упавшим.
      this.failures.delete(test.id);
    }
  }

  onEnd(result: FullResult): void {
    try {
      const markdown = this.buildMarkdown(result);
      const summaryPath = resolve('test-results', 'failure-summary.md');
      mkdirSync(dirname(summaryPath), { recursive: true });
      writeFileSync(summaryPath, markdown, 'utf8');

      if (process.env.GITHUB_STEP_SUMMARY) {
        appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`, 'utf8');
      }

      console.log(`\n${markdown}`);
    } catch (error) {
      console.error('[failure-reporter] не удалось записать сводку:', error);
    }
  }

  printsToStdio(): boolean {
    return true;
  }

  private appendOutput(chunk: string | Buffer, test?: TestCase, result?: TestResult): void {
    if (!test || !result) return;
    const key = `${test.id}:${result.retry}`;
    const previous = this.logs.get(key) ?? '';
    // Храним хвост логов: перед падением обычно важны последние строки.
    this.logs.set(key, (previous + chunk.toString()).slice(-8_000));
  }

  private buildMarkdown(result: FullResult): string {
    const failures = [...this.failures.values()];
    const job = process.env.GITHUB_JOB ?? 'Playwright';
    const duration = Math.round((Date.now() - this.startedAt) / 1000);

    if (!failures.length) {
      return [
        '## ✅ Playwright: упавших тестов нет',
        '',
        `- **Job:** ${job}`,
        `- **Результат:** ${result.status}`,
        `- **Длительность:** ${duration} с`,
        '',
      ].join('\n');
    }

    const lines: string[] = [
      `## ❌ Playwright: упало тестов — ${failures.length}`,
      '',
      `- **Job:** ${job}`,
      `- **Результат:** ${result.status}`,
      `- **Длительность:** ${duration} с`,
      '',
    ];

    failures.forEach(({ test, result: testResult, logs }, index) => {
      const parts = test.titlePath().filter(Boolean);
      const title = parts.slice(1).join(' › ') || parts.join(' › ');
      const project = test.parent.project()?.name ?? 'default';
      const error = clean(
        testResult.error?.message ?? testResult.error?.value ?? 'Причина не указана',
        4_000,
      );
      const testLogs = clean(logs, 3_000);
      const attachments = testResult.attachments
        .filter((attachment) => attachment.path)
        .map((attachment) => `\`${relative(process.cwd(), attachment.path!)}\``)
        .join(', ');
      const file = relative(process.cwd(), test.location.file);

      lines.push(`### ${index + 1}. [${project}] ${title}`, '');
      lines.push(`- **Проект:** \`${project}\``);
      lines.push(`- **Файл:** \`${file}:${test.location.line}\``);
      lines.push(`- **Попытка:** ${testResult.retry + 1}`);
      if (attachments) lines.push(`- **Вложения:** ${attachments}`);
      lines.push('', '**Причина:**', ...codeBlock(error));
      if (testLogs) lines.push('', '**Логи теста:**', ...codeBlock(testLogs));
      lines.push('');
    });

    return `${lines.join('\n')}\n`;
  }
}
