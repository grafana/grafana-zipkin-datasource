package zipkin

import (
	"context"
	"errors"
	"fmt"

	"github.com/grafana/grafana-plugin-sdk-go/backend"
	"github.com/grafana/grafana-plugin-sdk-go/backend/httpclient"
	"github.com/grafana/grafana-plugin-sdk-go/backend/instancemgmt"
	"github.com/grafana/grafana-plugin-sdk-go/backend/log"
	"github.com/grafana/grafana-plugin-sdk-go/backend/resource/httpadapter"
)

// var logger = backend.NewLoggerWith("logger", "tsdb.zipkin")

type Datasource struct {
	info   *DatasourceInfo
	logger log.Logger
}

func NewDatasource(ctx context.Context, settings backend.DataSourceInstanceSettings) (instancemgmt.Instance, error) {
	httpClientOptions, err := settings.HTTPClientOptions(ctx)
	if err != nil {
		return nil, backend.DownstreamError(fmt.Errorf("error reading settings: %w", err))
	}

	httpClient, err := httpclient.NewProvider().New(httpClientOptions)
	if err != nil {
		return nil, fmt.Errorf("error creating http client: %w", err)
	}

	if settings.URL == "" {
		return nil, backend.DownstreamError(errors.New("error reading settings: url is empty"))
	}

	logger := log.New().FromContext(ctx)
	zipkinClient := DatasourceInfo{
		logger:     logger,
		url:        settings.URL,
		httpClient: httpClient,
	}
	return &Datasource{info: &zipkinClient, logger: logger}, nil
}

func (ds *Datasource) CheckHealth(ctx context.Context, req *backend.CheckHealthRequest) (*backend.CheckHealthResult, error) {
	logger := ds.logger.FromContext(ctx)
	client, err := NewZipkinClient(ctx, ds.info, logger)
	if err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}
	if _, err := client.Services(); err != nil {
		return &backend.CheckHealthResult{
			Status:  backend.HealthStatusError,
			Message: err.Error(),
		}, nil
	}
	return &backend.CheckHealthResult{
		Status:  backend.HealthStatusOk,
		Message: "Data source is working",
	}, nil
}

func (ds *Datasource) CallResource(ctx context.Context, req *backend.CallResourceRequest, sender backend.CallResourceResponseSender) error {
	logger := ds.logger.FromContext(ctx)
	client, _ := NewZipkinClient(ctx, ds.info, logger)
	handler := httpadapter.New(ds.registerResourceRoutes(client))
	return handler.CallResource(ctx, req, sender)
}

func (ds *Datasource) QueryData(ctx context.Context, req *backend.QueryDataRequest) (*backend.QueryDataResponse, error) {
	logger := ds.logger.FromContext(ctx)
	client, _ := NewZipkinClient(ctx, ds.info, logger)
	return queryData(ctx, client, logger, req)
}
