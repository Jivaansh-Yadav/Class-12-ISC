window.APP_TRACKER_CONFIG = {
  // If both values are filled, tracker reads/writes Supabase directly.
  supabaseUrl: '',
  supabaseAnonKey: '',
  table: 'applications'
};

// Edit this list for quick manual updates (used when Supabase config is empty).
window.APP_TRACKER_ITEMS = [
  {
    id: 1,
    test_name: 'Krea Aptitude Test - Regular',
    exam_date: '9 Apr 2026 - 15 Apr 2026',
    deadline: '27 Mar 2026',
    apply_link: 'https://example.com/apply',
    form_link: '',
    status: 'open'
  }
];
