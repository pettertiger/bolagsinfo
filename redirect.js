/**
 * Redirect handler for old bolagsinfo domain
 * Redirects all requests from bolagsinfo.lantero.online to intra.lantero.online
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Replace the hostname with the new domain
    url.hostname = 'intra.lantero.online';
    
    // Perform a permanent redirect (301)
    return Response.redirect(url.toString(), 301);
  }
};
