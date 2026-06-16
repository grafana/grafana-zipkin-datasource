package zipkin

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/openzipkin/zipkin-go/model"
)

type DatasourceInfo struct {
	logger     log.Logger
	url        string
	httpClient *http.Client
}

// Client represents a client which can interact with zipkin api
type Client interface {
	Services() ([]string, error)
	Spans(serviceName string) ([]string, error)
	Traces(serviceName string, spanName string) ([][]model.SpanModel, error)
	Trace(traceId string) ([]model.SpanModel, error)
}

// NewZipkinClient creates a new elasticsearch client
var NewZipkinClient = func(ctx context.Context, ds *DatasourceInfo, logger log.Logger) (Client, error) {
	logger.Debug("Creating new client")
	return &baseClientImpl{
		ctx:    ctx,
		ds:     ds,
		logger: logger,
	}, nil
}

type baseClientImpl struct {
	ctx    context.Context
	ds     *DatasourceInfo
	logger log.Logger
}

// Services returns list of services
// https://zipkin.io/zipkin-api/#/default/get_services
func (c *baseClientImpl) Services() ([]string, error) {
	services := []string{}
	u, err := url.JoinPath(c.ds.url, "/api/v2/services")
	if err != nil {
		return services, backend.DownstreamError(fmt.Errorf("failed to join url: %w", err))
	}
	res, err := c.ds.httpClient.Get(u)
	if err != nil {
		return services, err
	}

	defer func() {
		if err = res.Body.Close(); err != nil {
			c.logger.Error("Failed to close response body", "error", err)
		}
	}()
	if err := json.NewDecoder(res.Body).Decode(&services); err != nil {
		return services, err
	}
	return services, err
}

// Spans returns list of spans for the given service
// https://zipkin.io/zipkin-api/#/default/get_spans
func (c *baseClientImpl) Spans(serviceName string) ([]string, error) {
	spans := []string{}
	if serviceName == "" {
		return spans, errors.New("invalid/empty serviceName")
	}

	spansUrl, err := createZipkinURL(c.ds.url, "/api/v2/spans", map[string]string{"serviceName": serviceName})
	if err != nil {
		return spans, backend.DownstreamError(fmt.Errorf("failed to compose url: %w", err))
	}

	res, err := c.ds.httpClient.Get(spansUrl)
	defer func() {
		if res != nil {
			if err = res.Body.Close(); err != nil {
				c.logger.Error("Failed to close response body", "error", err)
			}
		}
	}()
	if err != nil {
		return spans, err
	}
	if err := json.NewDecoder(res.Body).Decode(&spans); err != nil {
		return spans, err
	}
	return spans, err
}

// Traces returns list of traces for the given service and span
// https://zipkin.io/zipkin-api/#/default/get_traces
func (c *baseClientImpl) Traces(serviceName string, spanName string) ([][]model.SpanModel, error) {
	traces := [][]model.SpanModel{}
	if serviceName == "" {
		return traces, errors.New("invalid/empty serviceName")
	}
	if spanName == "" {
		return traces, errors.New("invalid/empty spanName")
	}
	tracesUrl, err := createZipkinURL(c.ds.url, "/api/v2/traces", map[string]string{"serviceName": serviceName, "spanName": spanName})
	if err != nil {
		return traces, backend.DownstreamError(fmt.Errorf("failed to compose url: %w", err))
	}

	res, err := c.ds.httpClient.Get(tracesUrl)
	defer func() {
		if res != nil {
			if err = res.Body.Close(); err != nil {
				c.logger.Error("Failed to close response body", "error", err)
			}
		}
	}()
	if err != nil {
		return traces, err
	}
	if err := json.NewDecoder(res.Body).Decode(&traces); err != nil {
		return traces, err
	}
	return traces, err
}

// Trace returns trace for the given traceId
// https://zipkin.io/zipkin-api/#/default/get_trace__traceId_
func (c *baseClientImpl) Trace(traceId string) ([]model.SpanModel, error) {
	trace := []model.SpanModel{}
	if traceId == "" {
		return trace, backend.DownstreamError(errors.New("invalid/empty traceId"))
	}

	traceUrl, err := url.JoinPath(c.ds.url, "/api/v2/trace", url.QueryEscape(traceId))
	if err != nil {
		return trace, backend.DownstreamError(fmt.Errorf("failed to join url: %w", err))
	}

	res, err := c.ds.httpClient.Get(traceUrl)
	if err != nil {
		if backend.IsDownstreamHTTPError(err) {
			return trace, backend.DownstreamError(err)
		}
		return trace, err
	}

	defer func() {
		if res != nil {
			if err = res.Body.Close(); err != nil {
				c.logger.Error("Failed to close response body", "error", err)
			}
		}
	}()

	if res != nil && res.StatusCode/100 != 2 {
		err := backend.DownstreamError(fmt.Errorf("request failed: %s", res.Status))
		if backend.ErrorSourceFromHTTPStatus(res.StatusCode) == backend.ErrorSourceDownstream {
			return trace, backend.DownstreamError(err)
		}
		return trace, err
	}

	if err := json.NewDecoder(res.Body).Decode(&trace); err != nil {
		return trace, err
	}
	return trace, err
}

func createZipkinURL(baseURL string, path string, params map[string]string) (string, error) {
	// Parse the base URL
	finalUrl, err := url.Parse(baseURL)
	if err != nil {
		return "", err
	}
	// Add the path
	urlPath, err := url.JoinPath(finalUrl.Path, path)
	if err != nil {
		return "", err
	}
	finalUrl.Path = urlPath
	// If there are query parameters, add them
	if len(params) > 0 {
		queryParams := finalUrl.Query()
		for k, v := range params {
			queryParams.Set(k, v)
		}
		finalUrl.RawQuery = queryParams.Encode()
	}
	// Return the composed URL as a string
	return finalUrl.String(), nil
}
