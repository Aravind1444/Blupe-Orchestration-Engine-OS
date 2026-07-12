import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // GET: List or Retrieve
  if (event.httpMethod === 'GET') {
    const { id, category, featured, search } = event.queryStringParameters || {};

    try {
      if (id) {
        // Fetch single template
        const { data, error } = await supabase
          .from('public_templates')
          .select('*, creator:creator_user_id(email)')
          .eq('id', id)
          .eq('is_active', true)
          .single();

        if (error) throw error;
        if (!data) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Template not found' }) };

        return { statusCode: 200, headers, body: JSON.stringify(data) };
      } 
      
      // List templates
      let query = supabase
        .from('public_templates')
        .select('id, name, description, category, tags, install_count, created_at, is_featured, creator_user_id')
        .eq('is_active', true)
        .order('is_featured', { ascending: false })
        .order('install_count', { ascending: false });

      if (category && category !== 'All') {
        query = query.eq('category', category);
      }
      
      if (featured === 'true') {
        query = query.eq('is_featured', true);
      }

      if (search) {
        // Simple search on name/description/tags
        // Note: Full text search might be better but ilike is okay for now
        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return { statusCode: 200, headers, body: JSON.stringify(data) };

    } catch (error) {
      console.error('Fetch Templates Error:', error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  // POST: Publish Template
  if (event.httpMethod === 'POST') {
    try {
      // Auth check
      const authHeader = event.headers.authorization;
      if (!authHeader) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing Authorization header' }) };
      }

      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);

      if (authError || !user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
      }

      const { name, description, category, nodes, edges, tags, sourceFlowId } = JSON.parse(event.body);

      if (!name || !nodes || !edges) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
      }

      // Sanitize nodes/edges to remove secrets if any?
      // For now assume user is responsible, but we should strip sensitive data if possible.
      // Ideally UI warns user.

      const { data, error } = await supabase
        .from('public_templates')
        .insert({
          name,
          description,
          category: category || 'Other',
          nodes,
          edges,
          tags: tags || [],
          creator_user_id: user.id,
          source_flow_id: sourceFlowId
        })
        .select()
        .single();

      if (error) throw error;

      return { statusCode: 201, headers, body: JSON.stringify(data) };

    } catch (error) {
      console.error('Publish Template Error:', error);
      return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
    }
  }

  return { statusCode: 405, headers, body: 'Method Not Allowed' };
};
