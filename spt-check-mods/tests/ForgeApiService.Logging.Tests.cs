using System.Net;
using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Xunit;

namespace CheckMods.Tests
{
    public class ForgeApiServiceLoggingTests
    {
        [Fact]
        public async Task GetJsonResponseStringAsync_LogsResponse_DebugLevel()
        {
            // Arrange - simple test HttpClient returning JSON
            var handler = new DelegatingHandlerStub(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{\"ok\":true}")
            });

            var httpClient = new HttpClient(handler);
            var logger = new TestLogger<CheckMods.Services.ForgeApiService>();
            var service = new CheckMods.Services.ForgeApiService(httpClient, logger);

            // Act
            var result = await service.GetAllSptVersionsAsync("https://example.invalid/api/spt/versions?sort=-version&per_page=15");

            // Assert - test logger captured the debug message
            Assert.Contains(logger.Entries, e => e.LogLevel == LogLevel.Debug && e.Message.Contains("API Response"));
        }
    }

    // Very small test logger to capture entries
    internal class TestLogger<T> : ILogger<T>
    {
        public System.Collections.Generic.List<(LogLevel LogLevel, string Message)> Entries { get; } = new();

        IDisposable ILogger.BeginScope<TState>(TState state) => null!;
        bool ILogger.IsEnabled(LogLevel logLevel) => true;

        void ILogger.Log<TState>(LogLevel logLevel, EventId eventId, TState state, System.Exception exception, System.Func<TState, System.Exception, string> formatter)
        {
            Entries.Add((logLevel, formatter(state, exception)));
        }
    }

    // Minimal delegating handler stub
    internal class DelegatingHandlerStub : DelegatingHandler
    {
        private readonly HttpResponseMessage _response;
        public DelegatingHandlerStub(HttpResponseMessage response)
        {
            _response = response;
        }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, System.Threading.CancellationToken cancellationToken)
        {
            return Task.FromResult(_response);
        }
    }
}
