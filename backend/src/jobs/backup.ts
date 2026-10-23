import { createBackup } from '../services/backup.service';

async function main() {
  const record = await createBackup(undefined, 'Scheduled/CLI backup', 'scheduled');
  console.log('Backup created:', record.filename, record.filepath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
