package zipkin

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
)

func (ds *Datasource) registerResourceRoutes(client Client) *http.ServeMux {
	router := http.NewServeMux()
	router.HandleFunc("GET /services", getServicesHandler(client))
	router.HandleFunc("GET /spans", getSpansHandler(client))
	router.HandleFunc("GET /traces", getTracesHandler(client))
	router.HandleFunc("GET /trace/{traceId}", getTraceHandler(client))
	return router
}

func getServicesHandler(c Client) http.HandlerFunc {
	return func(rw http.ResponseWriter, r *http.Request) {
		services, err := c.Services()
		writeResponse(services, err, rw)
	}
}

func getSpansHandler(c Client) http.HandlerFunc {
	return func(rw http.ResponseWriter, r *http.Request) {
		serviceName := strings.TrimSpace(r.URL.Query().Get("serviceName"))
		spans, err := c.Spans(serviceName)
		writeResponse(spans, err, rw)
	}
}

func getTracesHandler(c Client) http.HandlerFunc {
	return func(rw http.ResponseWriter, r *http.Request) {
		serviceName := strings.TrimSpace(r.URL.Query().Get("serviceName"))
		spanName := strings.TrimSpace(r.URL.Query().Get("spanName"))
		traces, err := c.Traces(serviceName, spanName)
		writeResponse(traces, err, rw)
	}
}

func getTraceHandler(c Client) http.HandlerFunc {
	return func(rw http.ResponseWriter, r *http.Request) {
		traceId := strings.TrimSpace(r.PathValue("traceId"))
		trace, err := c.Trace(traceId)
		writeResponse(trace, err, rw)
	}
}

func writeResponse(res interface{}, err error, rw http.ResponseWriter) {
	if err != nil {
		backend.Logger.Warn("An error occurred while doing a resource call", "error", err)
		http.Error(rw, "An error occurred within the plugin", http.StatusInternalServerError)
		return
	}
	if str, ok := res.(string); ok {
		rw.Header().Set("Content-Type", "text/plain")
		_, _ = rw.Write([]byte(str))
		return
	}
	b, err := json.Marshal(res)
	if err != nil {
		backend.Logger.Warn("An error occurred while processing response from resource call", "error", err)
		http.Error(rw, "An error occurred within the plugin", http.StatusInternalServerError)
		return
	}
	rw.Header().Set("Content-Type", "application/json")
	_, _ = rw.Write(b)
}
