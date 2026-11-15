import { redirect } from 'next/navigation';

// The Runner view now lives inside Requests (it opens the runner view for whoever is on Runner duty).
export default function RunnerPage() {
  redirect('/requests');
}
