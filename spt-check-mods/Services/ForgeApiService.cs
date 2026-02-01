using System;
using System.Net.Http;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace CheckMods.Services
{
    // Minimal, focused excerpt of ForgeApiService with added debug response logging.
    public partial class ForgeApiService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<ForgeApiService> _logger;
        private static readonly JsonSerializerOptions _jsonOptions = new() { PropertyNameCaseInsensitive = true };

        public ForgeApiService(HttpClient httpClient, ILogger<ForgeApiService> logger)
        {
            _httpClient = httpClient;
            _logger = logger;
        }

        private static string TruncateForLog(string s, int max = 32_000)
        {
            if (s is null) return string.Empty;
            return s.Length <= max ? s : s.Substring(0, max) + "... (truncated)";
        }

        private async Task<string> GetJsonResponseStringAsync(HttpResponseMessage response, string url, CancellationToken cancellationToken)
        {
            var jsonContent = await response.Content.ReadAsStringAsync(cancellationToken);

            // Log the response body at Debug level (truncated to avoid excessively large logs)
            try
            {
                _logger.LogDebug("API Response: {Url}: {Body}", url, TruncateForLog(jsonContent));
            }
            catch (Exception ex)
            {
                // Protect production flow from logging errors
                _logger.LogDebug(ex, "Failed to log API response for {Url}", url);
            }

            return jsonContent;
        }

        // Example: Search internal method where we read JSON response
        private async Task<object> SearchModsInternalAsync(string searchQuery, string sptVersion, CancellationToken cancellationToken = default)
        {
            var url = $"https://forge.sp-tarkov.com/api/v0/mods?query={Uri.EscapeDataString(searchQuery)}&filter[spt_version]={sptVersion}&include=versions,source_code_links";
            var response = await _httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("API returned status {StatusCode} for {Url}", response.StatusCode, url);
                return null;
            }

            var jsonContent = await GetJsonResponseStringAsync(response, url, cancellationToken);
            var apiResponse = JsonSerializer.Deserialize<object>(jsonContent, _jsonOptions);
            return apiResponse ?? new object();
        }

        // Example: GetModUpdates
        private async Task<object> GetModUpdatesAsync(string url, CancellationToken cancellationToken = default)
        {
            var response = await _httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Mod updates request failed: {StatusCode} for {Url}", response.StatusCode, url);
                return null;
            }

            var jsonContent = await GetJsonResponseStringAsync(response, url, cancellationToken);
            var apiResponse = JsonSerializer.Deserialize<object>(jsonContent, _jsonOptions);
            return apiResponse ?? new object();
        }

        // Example: ValidateApiKey
        private async Task<bool> ValidateApiKeyAsync(string apiKey, CancellationToken cancellationToken = default)
        {
            var url = "https://forge.sp-tarkov.com/api/v0/auth/abilities";
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
            var response = await _httpClient.SendAsync(request, cancellationToken);

            if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized || response.StatusCode == System.Net.HttpStatusCode.Forbidden)
            {
                _logger.LogWarning("API key validation failed: {StatusCode}", response.StatusCode);
                return false;
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("API key validation failed with server error: {StatusCode}", response.StatusCode);
                return false;
            }

            var jsonContent = await GetJsonResponseStringAsync(response, url, cancellationToken);
            var authResponse = JsonSerializer.Deserialize<object>(jsonContent, _jsonOptions);

            // Keep existing behaviour - for example purposes assume valid when non-null
            return authResponse != null;
        }

        // Example: GetAllSptVersions
        private async Task<object> GetAllSptVersionsAsync(string url, CancellationToken cancellationToken = default)
        {
            var response = await _httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogError("Failed to fetch SPT versions: {StatusCode}", response.StatusCode);
                return null;
            }

            var jsonContent = await GetJsonResponseStringAsync(response, url, cancellationToken);
            var apiResponse = JsonSerializer.Deserialize<object>(jsonContent, _jsonOptions);
            return apiResponse ?? new object();
        }
    }
}
