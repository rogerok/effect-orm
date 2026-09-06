# Миллион строк свёрнут через standalone Stream

Пользователь собрал самостоятельную программу E2.7 с DB-side recursive CTE и потоковым `runFold`. Запуск `node --conditions=development --import tsx src/hw/e2-7.ts` завершился за 1.11 s и вернул `{ sum: 500000500000, count: 1000000 }`; LSP-диагностика чистая.

**Implications:** функциональная часть миллионного full table scan подтверждена. Для завершения упражнения осталось измерить V8 heap до и после scan, отдельно обозначив, что heap snapshot не показывает native SQLite pages и кратковременный peak.
